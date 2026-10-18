/**
 * Reads everything the registration page needs from Solana for one wallet:
 * the merchant account (authoritative registration + active state), the wallet's SOL
 * balance, and the rent the merchant account will lock up.
 *
 * The backend has no `GET /merchant/status` yet (PRD §20), so this reads the merchant PDA
 * directly. When that endpoint ships, swap `load()` for an API call; the shape stays the same.
 */
import type { Address } from '@solana/kit';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clusterLabel, config } from '../../config';
import type { FriendlyError } from '../../lib/errors';
import { fetchMerchant, findMerchantPda, MERCHANT_ACCOUNT_SIZE, type MerchantAccount } from '../../solana/merchantRegistry';
import { rpc } from '../../solana/rpc';

/** Rent-exempt minimum for 42 bytes: (42 + 128) × 3480 × 2 lamports. Used only if the RPC call fails. */
export const FALLBACK_RENT = 1_183_200n;
/** Base fee for one signature. The transaction sets no priority fee. */
export const NETWORK_FEE = 5_000n;

export interface ChainSnapshot {
    merchant: MerchantAccount | null;
    /** The address the merchant account lives at, derived from the wallet. */
    pda: Address;
    /** The PDA bump seed (first value from 255 down that is off the curve). */
    bump: number;
    /** null when the balance couldn't be read; the UI then stays quiet about funding. */
    balance: bigint | null;
    rent: bigint;
}

export type MerchantStatus =
    | { state: 'loading' }
    | { state: 'error'; error: FriendlyError }
    | { state: 'ready'; data: ChainSnapshot; refreshing: boolean };

async function load(wallet: Address): Promise<ChainSnapshot> {
    const [pda, bump] = await findMerchantPda(wallet);
    const [merchant, balance, rent] = await Promise.all([
        fetchMerchant(wallet),
        rpc
            .getBalance(wallet, { commitment: 'confirmed' })
            .send()
            .then(r => r.value as bigint)
            .catch(() => null),
        rpc
            .getMinimumBalanceForRentExemption(BigInt(MERCHANT_ACCOUNT_SIZE))
            .send()
            .then(v => v as bigint)
            .catch(() => FALLBACK_RENT),
    ]);
    return { merchant, pda, bump, balance, rent };
}

export function useMerchantStatus(wallet: Address | undefined) {
    const [status, setStatus] = useState<MerchantStatus>({ state: 'loading' });
    const generation = useRef(0);

    const refresh = useCallback(
        async (opts: { quiet?: boolean } = {}): Promise<ChainSnapshot | null> => {
            if (!wallet) return null;
            const run = ++generation.current;
            setStatus(prev =>
                opts.quiet && prev.state === 'ready' ? { ...prev, refreshing: true } : { state: 'loading' },
            );
            try {
                const data = await load(wallet);
                if (run === generation.current) setStatus({ state: 'ready', data, refreshing: false });
                return data;
            } catch {
                if (run === generation.current) {
                    setStatus({
                        state: 'error',
                        error: {
                            title: "Couldn't check your merchant status",
                            body: `Payrail reads your merchant account from Solana ${clusterLabel[config.cluster]}, and the RPC endpoint didn't answer. Check your connection and try again.`,
                            action: 'retry',
                        },
                    });
                }
                return null;
            }
        },
        [wallet],
    );

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { status, refresh };
}
