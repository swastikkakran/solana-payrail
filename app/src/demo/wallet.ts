/**
 * "Demo Wallet": a Wallet Standard wallet that lives in the page. The app discovers it exactly like
 * Phantom or Solflare and calls the same features (standard:connect, solana:signTransaction), so the
 * whole real signing path runs. The key is an in-memory Ed25519 key for this tab; signing asks for
 * approval in an on-page popup.
 */
import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey, getBase58Decoder, signBytes } from '@solana/kit';

import { config } from '../config';
import { INITIALIZE_DISCRIMINATOR, UPDATE_DISCRIMINATOR } from '../solana/merchantRegistry';
import { requestApproval } from './approval';
import { decodeWireTransaction, sameBytes } from './wire';

export const DEMO_WALLET_NAME = 'Demo Wallet';
const KEY_STORE = 'payrail:demo-wallet';

const ICON =
    'data:image/svg+xml;base64,' +
    btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#f2b84b"/><path d="M8.5 11.5h15v10h-15z" fill="none" stroke="#131a21" stroke-width="2.2" stroke-linejoin="round"/><path d="M8.5 11.5l2-3h11l2 3" fill="none" stroke="#131a21" stroke-width="2.2" stroke-linejoin="round"/><circle cx="19.5" cy="16.5" r="1.6" fill="#131a21"/></svg>',
    );

interface Keys {
    address: string;
    publicKey: Uint8Array;
    sign: (message: Uint8Array) => Promise<Uint8Array>;
}

function loadSeed(): Uint8Array {
    try {
        const saved = sessionStorage.getItem(KEY_STORE);
        if (saved) return Uint8Array.from(JSON.parse(saved) as number[]);
    } catch {
        /* new seed */
    }
    const seed = crypto.getRandomValues(new Uint8Array(32));
    try {
        sessionStorage.setItem(KEY_STORE, JSON.stringify([...seed]));
    } catch {
        /* memory only */
    }
    return seed;
}

let keysPromise: Promise<Keys> | null = null;
function keys(): Promise<Keys> {
    keysPromise ??= (async () => {
        const seed = loadSeed();
        try {
            const pair = await createKeyPairFromPrivateKeyBytes(seed);
            const address = await getAddressFromPublicKey(pair.publicKey);
            const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
            return { address, publicKey, sign: async m => new Uint8Array(await signBytes(pair.privateKey, m)) };
        } catch {
            // Browsers without WebCrypto Ed25519: the simulated network doesn't verify signatures.
            const publicKey = seed.slice();
            return {
                address: getBase58Decoder().decode(publicKey),
                publicKey,
                sign: async () => crypto.getRandomValues(new Uint8Array(64)),
            };
        }
    })();
    return keysPromise;
}

type ChangeListener = (props: { accounts: readonly unknown[] }) => void;

export function registerDemoWallet() {
    const listeners = new Set<ChangeListener>();
    let accounts: readonly unknown[] = [];
    let connected = false;

    const makeAccount = (k: Keys) =>
        Object.freeze({
            address: k.address,
            publicKey: k.publicKey,
            chains: [config.chain],
            features: ['solana:signTransaction', 'solana:signMessage'],
            label: 'Demo merchant',
            icon: ICON,
        });

    const describe = (wire: Uint8Array) => {
        try {
            const ix = decodeWireTransaction(wire).instructions[0];
            if (!ix) return { instruction: 'unknown' as const, program: '', accounts: [] };
            const instruction = sameBytes(ix.data, INITIALIZE_DISCRIMINATOR)
                ? ('initialize' as const)
                : sameBytes(ix.data, UPDATE_DISCRIMINATOR)
                  ? ('update' as const)
                  : ('unknown' as const);
            return { instruction, program: ix.program, accounts: ix.accounts };
        } catch {
            return { instruction: 'unknown' as const, program: '', accounts: [] };
        }
    };

    const wallet = {
        version: '1.0.0' as const,
        name: DEMO_WALLET_NAME,
        icon: ICON,
        chains: [config.chain],
        get accounts() {
            return accounts;
        },
        features: {
            'standard:connect': {
                version: '1.0.0',
                async connect(input?: { silent?: boolean }) {
                    if (!connected) {
                        if (input?.silent) {
                            // Reconnect silently only if this tab connected before.
                            let seen = false;
                            try {
                                seen = sessionStorage.getItem(KEY_STORE) !== null;
                            } catch {
                                seen = false;
                            }
                            if (!seen) return { accounts: [] };
                        } else if (!(await requestApproval({ kind: 'connect' }))) {
                            throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
                        }
                    }
                    connected = true;
                    accounts = [makeAccount(await keys())];
                    for (const l of listeners) l({ accounts });
                    return { accounts };
                },
            },
            'standard:disconnect': {
                version: '1.0.0',
                async disconnect() {
                    connected = false;
                    accounts = [];
                    for (const l of listeners) l({ accounts });
                },
            },
            'standard:events': {
                version: '1.0.0',
                on(event: string, listener: ChangeListener) {
                    if (event !== 'change') return () => {};
                    listeners.add(listener);
                    return () => listeners.delete(listener);
                },
            },
            'solana:signMessage': {
                version: '1.0.0',
                async signMessage(input: { account: unknown; message: Uint8Array }) {
                    const ok = await requestApproval({ kind: 'message', message: new TextDecoder().decode(input.message) });
                    if (!ok) throw Object.assign(new Error('User rejected the signature.'), { code: 4001 });
                    const k = await keys();
                    return [{ signedMessage: input.message, signature: await k.sign(input.message) }];
                },
            },
            'solana:signTransaction': {
                version: '1.0.0',
                supportedTransactionVersions: ['legacy', 0],
                async signTransaction(...inputs: { transaction: Uint8Array }[]) {
                    const k = await keys();
                    const outputs = [];
                    for (const input of inputs) {
                        const wire = new Uint8Array(input.transaction);
                        const ok = await requestApproval({ kind: 'sign', ...describe(wire) });
                        if (!ok) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
                        const decoded = decodeWireTransaction(wire);
                        const signature = await k.sign(wire.slice(decoded.messageOffset));
                        const signed = wire.slice();
                        // Fee payer is always signer #0; the signature section starts after its length byte.
                        signed.set(signature, decoded.messageOffset - 64 * decoded.signatures.length);
                        outputs.push({ signedTransaction: signed });
                    }
                    return outputs;
                },
            },
        },
    };

    const callback = ({ register }: { register: (w: unknown) => unknown }) => register(wallet);
    try {
        const event = new Event('wallet-standard:register-wallet');
        Object.defineProperty(event, 'detail', { value: callback });
        window.dispatchEvent(event);
    } catch (e) {
        console.error('Demo wallet could not register', e);
    }
    window.addEventListener('wallet-standard:app-ready', ((e: CustomEvent) => callback(e.detail)) as EventListener);
}
