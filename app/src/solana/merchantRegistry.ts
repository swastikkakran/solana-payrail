/**
 * Client for the `merchant_registry` Anchor program (programs/merchant-registry on the
 * migration/v3 branch).
 *
 * The backend uses a Codama-generated client (src/onchain/generated), but that output is
 * git-ignored and needs `anchor build` to regenerate. The two instructions a merchant signs
 * are tiny, so they are encoded here by hand against the program source. The function names
 * mirror Codama's output, so this file can be swapped for the generated client later without
 * touching the UI.
 *
 *   initialize   accounts: payer (writable, signer), merchant PDA (writable, init), system_program
 *                data:     anchor discriminator only (no args)
 *   update       accounts: payer (writable, signer), merchant PDA (writable)
 *                data:     anchor discriminator only; flips merchant.is_active
 *
 *   Merchant     8-byte discriminator | payout_wallet: Pubkey | is_active: bool | bump: u8
 */
import {
    AccountRole,
    address,
    fetchEncodedAccount,
    fixDecoderSize,
    getAddressDecoder,
    getAddressEncoder,
    getBooleanDecoder,
    getBytesDecoder,
    getProgramDerivedAddress,
    getStructDecoder,
    getU8Decoder,
    type Address,
    type Instruction,
    type ReadonlyUint8Array,
    type TransactionSigner,
} from '@solana/kit';

import { config } from '../config';
import { rpc } from './rpc';

export const MERCHANT_REGISTRY_PROGRAM_ADDRESS = config.programId;
export const SYSTEM_PROGRAM_ADDRESS = address('11111111111111111111111111111111');

/** `#[constant] MERCHANT_SEED = b"merchant"` */
const MERCHANT_SEED = 'merchant';

/**
 * Anchor discriminators: first 8 bytes of sha256("global:<ix>") / sha256("account:<Type>").
 * Verified by scripts/verify-discriminators.mjs.
 */
export const INITIALIZE_DISCRIMINATOR = new Uint8Array([175, 175, 109, 31, 13, 152, 155, 237]);
export const UPDATE_DISCRIMINATOR = new Uint8Array([219, 200, 88, 176, 158, 63, 253, 127]);
export const MERCHANT_ACCOUNT_DISCRIMINATOR = new Uint8Array([71, 235, 30, 40, 231, 21, 32, 64]);

/** `space = 8 + Merchant::INIT_SPACE` = 8 + 32 + 1 + 1 */
export const MERCHANT_ACCOUNT_SIZE = 42;

export interface MerchantAccount {
    /** The merchant PDA. */
    address: Address;
    payoutWallet: Address;
    isActive: boolean;
    bump: number;
    lamports: bigint;
}

const merchantDecoder = getStructDecoder([
    ['discriminator', fixDecoderSize(getBytesDecoder(), 8)],
    ['payoutWallet', getAddressDecoder()],
    ['isActive', getBooleanDecoder()],
    ['bump', getU8Decoder()],
]);

function bytesEqual(a: ReadonlyUint8Array, b: ReadonlyUint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/** seeds = [MERCHANT_SEED, payer] — the merchant PDA is keyed by the payout wallet. */
export async function findMerchantPda(payer: Address) {
    return getProgramDerivedAddress({
        programAddress: MERCHANT_REGISTRY_PROGRAM_ADDRESS,
        seeds: [MERCHANT_SEED, getAddressEncoder().encode(payer)],
    });
}

export function decodeMerchant(pda: Address, data: ReadonlyUint8Array, lamports: bigint): MerchantAccount {
    const decoded = merchantDecoder.decode(data);
    if (!bytesEqual(decoded.discriminator, MERCHANT_ACCOUNT_DISCRIMINATOR)) {
        throw new Error('Account at the merchant address is not a Payrail merchant account.');
    }
    return {
        address: pda,
        payoutWallet: decoded.payoutWallet,
        isActive: decoded.isActive,
        bump: decoded.bump,
        lamports,
    };
}

/** Reads the merchant account straight from chain. Returns null when the wallet isn't registered. */
export async function fetchMerchant(wallet: Address): Promise<MerchantAccount | null> {
    const [pda] = await findMerchantPda(wallet);
    const account = await fetchEncodedAccount(rpc, pda, { commitment: 'confirmed' });
    if (!account.exists) return null;
    if (account.programAddress !== MERCHANT_REGISTRY_PROGRAM_ADDRESS) {
        throw new Error('Merchant address is owned by an unexpected program.');
    }
    return decodeMerchant(pda, account.data, account.lamports);
}

export async function getInitializeInstructionAsync(payer: TransactionSigner): Promise<Instruction> {
    const [merchant] = await findMerchantPda(payer.address);
    return {
        programAddress: MERCHANT_REGISTRY_PROGRAM_ADDRESS,
        accounts: [
            { address: payer.address, role: AccountRole.WRITABLE_SIGNER, signer: payer },
            { address: merchant, role: AccountRole.WRITABLE },
            { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        ],
        data: INITIALIZE_DISCRIMINATOR,
    } as Instruction;
}

/** Toggles `is_active`. The program enforces `merchant.payout_wallet == payer`. */
export async function getUpdateInstructionAsync(payer: TransactionSigner): Promise<Instruction> {
    const [merchant] = await findMerchantPda(payer.address);
    return {
        programAddress: MERCHANT_REGISTRY_PROGRAM_ADDRESS,
        accounts: [
            { address: payer.address, role: AccountRole.WRITABLE_SIGNER, signer: payer },
            { address: merchant, role: AccountRole.WRITABLE },
        ],
        data: UPDATE_DISCRIMINATOR,
    } as Instruction;
}
