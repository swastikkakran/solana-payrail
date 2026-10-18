/**
 * Live, verifiable numbers for the landing page, read straight from the cluster:
 * is the program deployed, how many merchant accounts exist, how many are active.
 * Counting uses getProgramAccounts with a zero-length data slice, so only addresses come back.
 */
import { getBase58Decoder, type Base58EncodedBytes } from '@solana/kit';

import { config } from '../config';
import { MERCHANT_ACCOUNT_DISCRIMINATOR, MERCHANT_ACCOUNT_SIZE } from './merchantRegistry';
import { rpc } from './rpc';

const IS_ACTIVE_OFFSET = 8n + 32n; // discriminator + payout_wallet

export interface RegistryStats {
    deployed: boolean;
    executable: boolean;
    merchants: number | null;
    active: number | null;
}

function merchantFilters(onlyActive: boolean) {
    const discriminator = getBase58Decoder().decode(MERCHANT_ACCOUNT_DISCRIMINATOR) as Base58EncodedBytes;
    return [
        { dataSize: BigInt(MERCHANT_ACCOUNT_SIZE) },
        { memcmp: { offset: 0n, bytes: discriminator, encoding: 'base58' as const } },
        ...(onlyActive
            ? [{ memcmp: { offset: IS_ACTIVE_OFFSET, bytes: getBase58Decoder().decode(new Uint8Array([1])) as Base58EncodedBytes, encoding: 'base58' as const } }]
            : []),
    ];
}

async function count(onlyActive: boolean): Promise<number | null> {
    try {
        const accounts = await rpc
            .getProgramAccounts(config.programId, {
                encoding: 'base64',
                commitment: 'confirmed',
                dataSlice: { offset: 0, length: 0 },
                filters: merchantFilters(onlyActive),
            })
            .send();
        return accounts.length;
    } catch {
        // Some RPC providers disable getProgramAccounts; the strip just leaves the number out.
        return null;
    }
}

export async function fetchRegistryStats(): Promise<RegistryStats> {
    const [info, merchants, active] = await Promise.all([
        rpc.getAccountInfo(config.programId, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }).send(),
        count(false),
        count(true),
    ]);
    return {
        deployed: info.value !== null,
        executable: info.value?.executable ?? false,
        merchants,
        active,
    };
}

/** Current slot and how long the RPC took to answer, for the ticking slot counter. */
export async function pingSlot(): Promise<{ slot: bigint; ms: number }> {
    const started = performance.now();
    const slot = await rpc.getSlot({ commitment: 'confirmed' }).send();
    return { slot, ms: Math.round(performance.now() - started) };
}
