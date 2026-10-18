/**
 * A tiny simulated Solana for demo mode, exposed as a Kit RPC transport. It answers only the
 * methods this app calls, runs the merchant_registry rules the app depends on (initialize creates
 * the account and charges rent, update flips is_active and only the payout wallet may sign it),
 * and confirms transactions after a realistic delay. State lives in sessionStorage for the tab.
 */
import { getAddressEncoder, getBase58Decoder, getBase64Decoder, getBase64Encoder, type Address } from '@solana/kit';

import { config } from '../config';
import {
    INITIALIZE_DISCRIMINATOR,
    MERCHANT_ACCOUNT_DISCRIMINATOR,
    MERCHANT_ACCOUNT_SIZE,
    UPDATE_DISCRIMINATOR,
} from '../solana/merchantRegistry';
import { decodeWireTransaction, sameBytes } from './wire';

const STORE = 'payrail:demo-chain';
const RENT = 1_183_200;
const FEE = 5_000;
export const DEMO_STARTING_BALANCE = 2_000_000_000; // 2 SOL
const CONFIRM_MS = 1600;

interface Merchant {
    payout: string;
    active: boolean;
    bump: number;
}
interface State {
    merchants: Record<string, Merchant>; // keyed by PDA
    balances: Record<string, number>;
    sigs: Record<string, { at: number; slot: number; err: unknown }>;
    slot: number;
}

let memory: State | null = null;
function load(): State {
    if (memory) return memory;
    try {
        const raw = sessionStorage.getItem(STORE);
        if (raw) return (memory = JSON.parse(raw) as State);
    } catch {
        /* fall through */
    }
    return (memory = { merchants: {}, balances: {}, sigs: {}, slot: 412_000_000 });
}
function save(s: State) {
    memory = s;
    try {
        sessionStorage.setItem(STORE, JSON.stringify(s));
    } catch {
        /* memory only */
    }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const b58 = getBase58Decoder();
const b64enc = getBase64Encoder();
const b64dec = getBase64Decoder();

function randomBlockhash() {
    return b58.decode(crypto.getRandomValues(new Uint8Array(32)));
}

function balanceOf(s: State, who: string) {
    return s.balances[who] ?? DEMO_STARTING_BALANCE;
}

interface Effect {
    err: unknown;
    logs: string[];
    apply?: (s: State) => void;
}

/** What the program would do with this transaction, without doing it yet. */
function evaluate(s: State, wire: Uint8Array): Effect {
    const tx = decodeWireTransaction(wire);
    const payer = tx.accountKeys[0] ?? '';
    const ix = tx.instructions[0];
    const program = config.programId;
    const invoke = `Program ${program} invoke [1]`;
    if (!ix || ix.program !== program) {
        return { err: { InstructionError: [0, 'IncorrectProgramId'] }, logs: [] };
    }
    const pda = ix.accounts[1] ?? '';

    if (sameBytes(ix.data, INITIALIZE_DISCRIMINATOR)) {
        if (s.merchants[pda]) {
            return {
                err: { InstructionError: [0, { Custom: 0 }] },
                logs: [invoke, 'Program log: Instruction: Initialize', `Allocate: account Address { address: ${pda}, base: None } already in use`],
            };
        }
        if (balanceOf(s, payer) < RENT + FEE) {
            return {
                err: { InstructionError: [0, { Custom: 1 }] },
                logs: [invoke, 'Program log: Instruction: Initialize', `Transfer: insufficient lamports ${balanceOf(s, payer)}, need ${RENT}`],
            };
        }
        return {
            err: null,
            logs: [invoke, 'Program log: Instruction: Initialize', `Program ${program} consumed 6214 of 200000 compute units`, `Program ${program} success`],
            apply: st => {
                st.merchants[pda] = { payout: payer, active: true, bump: 254 };
                st.balances[payer] = balanceOf(st, payer) - RENT - FEE;
            },
        };
    }

    if (sameBytes(ix.data, UPDATE_DISCRIMINATOR)) {
        const m = s.merchants[pda];
        if (!m) return { err: { InstructionError: [0, { Custom: 3012 }] }, logs: [invoke, 'Program log: AnchorError: AccountNotInitialized'] };
        if (m.payout !== payer) {
            return {
                err: { InstructionError: [0, { Custom: 6000 }] },
                logs: [invoke, 'Program log: AnchorError: UnauthorizedPayoutWallet. Error Number: 6000.'],
            };
        }
        return {
            err: null,
            logs: [invoke, 'Program log: Instruction: Update', `Program ${program} success`],
            apply: st => {
                const target = st.merchants[pda];
                if (target) target.active = !target.active;
                st.balances[payer] = balanceOf(st, payer) - FEE;
            },
        };
    }
    return { err: { InstructionError: [0, 'InvalidInstructionData'] }, logs: [invoke] };
}

function merchantAccountData(m: Merchant) {
    const data = new Uint8Array(MERCHANT_ACCOUNT_SIZE);
    data.set(MERCHANT_ACCOUNT_DISCRIMINATOR, 0);
    data.set(getAddressEncoder().encode(m.payout as Address), 8);
    data[40] = m.active ? 1 : 0;
    data[41] = m.bump;
    return data;
}

type Params = unknown[];

async function handle(method: string, params: Params): Promise<unknown> {
    const s = load();
    const ctx = { context: { slot: s.slot } };
    switch (method) {
        case 'getAccountInfo': {
            const m = s.merchants[String(params[0])];
            if (!m) return { ...ctx, value: null };
            return {
                ...ctx,
                value: {
                    data: [b64dec.decode(merchantAccountData(m)), 'base64'],
                    executable: false,
                    lamports: RENT,
                    owner: config.programId,
                    rentEpoch: 0,
                    space: MERCHANT_ACCOUNT_SIZE,
                },
            };
        }
        case 'getBalance':
            return { ...ctx, value: balanceOf(s, String(params[0])) };
        case 'getMinimumBalanceForRentExemption':
            return Number(params[0]) === MERCHANT_ACCOUNT_SIZE ? RENT : 890_880;
        case 'getLatestBlockhash':
            return { ...ctx, value: { blockhash: randomBlockhash(), lastValidBlockHeight: s.slot + 150 } };
        case 'getBlockHeight':
            return s.slot - 20_000;
        case 'simulateTransaction': {
            const { err, logs } = evaluate(s, b64enc.encode(String(params[0])) as Uint8Array);
            await sleep(350);
            return { ...ctx, value: { err, logs, accounts: null, unitsConsumed: 6214, returnData: null } };
        }
        case 'sendTransaction': {
            const wire = b64enc.encode(String(params[0])) as Uint8Array;
            const effect = evaluate(s, wire);
            const sig = b58.decode(decodeWireTransaction(wire).signatures[0] ?? new Uint8Array(64));
            effect.apply?.(s);
            s.slot += 3;
            s.sigs[sig] = { at: Date.now() + CONFIRM_MS, slot: s.slot, err: effect.err };
            save(s);
            await sleep(250);
            return sig;
        }
        case 'getSignatureStatuses': {
            const list = (params[0] as string[]) ?? [];
            return {
                ...ctx,
                value: list.map(sig => {
                    const rec = s.sigs[sig];
                    if (!rec || Date.now() < rec.at) return null;
                    return { slot: rec.slot, confirmations: null, err: rec.err, confirmationStatus: 'confirmed', status: rec.err ? { Err: rec.err } : { Ok: null } };
                }),
            };
        }
        case 'getTransaction':
            return null;
        default:
            throw new Error(`Demo network does not implement ${method}`);
    }
}

/** Kit RpcTransport: receives the JSON-RPC payload, returns the JSON-RPC response object. */
export async function demoTransport<T>({ payload }: { payload: unknown }): Promise<T> {
    const { id, method, params } = payload as { id: string | number; method: string; params?: Params };
    await sleep(120 + Math.random() * 120);
    const result = await handle(method, params ?? []);
    return { jsonrpc: '2.0', id, result } as T;
}
