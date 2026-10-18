/**
 * Wallet Standard + Kit wiring.
 *
 * - Discovers every installed wallet that speaks Wallet Standard (Phantom, Solflare, Backpack…).
 * - Persists the chosen account and restores it silently on reload when the wallet allows.
 * - Raises a toast when the wallet switches accounts underneath us.
 *
 * Nothing here sees a private key: wallets only ever return public addresses and signatures.
 */
import { SelectedWalletAccountContextProvider, useSelectedWalletAccount } from '@solana/react';
import {
    getWalletFeature,
    uiWalletAccountBelongsToUiWallet,
    type UiWallet,
    type UiWalletAccount,
} from '@wallet-standard/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { config } from '../config';
import { DEMO } from '../demo/mode';
import { DEMO_WALLET_NAME } from '../demo/wallet';
import { shortAddress } from '../lib/format';
import { useToast } from '../components/Toasts';

const STORAGE_KEY = 'payrail:selected-wallet';

const stateSync = {
    getSelectedWallet(): string | null {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch {
            return null;
        }
    },
    storeSelectedWallet(key: string) {
        try {
            localStorage.setItem(STORAGE_KEY, key);
        } catch {
            /* private mode */
        }
    },
    deleteSelectedWallet() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* private mode */
        }
    },
};

function isUsableSolanaWallet(wallet: UiWallet) {
    // Demo mode signs against a simulated network, so only the simulated wallet is offered.
    if (DEMO) return wallet.name === DEMO_WALLET_NAME;
    const solana = wallet.chains.some(c => c.startsWith('solana:'));
    const canConnect = wallet.features.includes('standard:connect');
    const canSign =
        wallet.features.includes('solana:signTransaction') || wallet.features.includes('solana:signAndSendTransaction');
    return solana && canConnect && canSign;
}

export function WalletProvider({ children }: { children: ReactNode }) {
    return (
        <SelectedWalletAccountContextProvider filterWallets={isUsableSolanaWallet} stateSync={stateSync}>
            <WalletSession>{children}</WalletSession>
        </SelectedWalletAccountContextProvider>
    );
}

interface WalletContextValue {
    account: UiWalletAccount | undefined;
    wallet: UiWallet | undefined;
    wallets: readonly UiWallet[];
    select: (account: UiWalletAccount | undefined) => void;
    disconnect: () => Promise<void>;
    /** True while we try to silently restore the previous session on load. */
    restoring: boolean;
    dialogOpen: boolean;
    openDialog: () => void;
    closeDialog: () => void;
    signMessage: (message: string) => Promise<Uint8Array>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function WalletSession({ children }: { children: ReactNode }) {
    const [account, setAccount, wallets] = useSelectedWalletAccount();
    const [dialogOpen, setDialogOpen] = useState(false);
    const toast = useToast();

    const wallet = useMemo(
        () => (account ? wallets.find(w => uiWalletAccountBelongsToUiWallet(account, w)) : undefined),
        [account, wallets],
    );

    // Silent reconnect: wallets only expose accounts after `connect`, so ask the remembered
    // wallet to reconnect without a prompt. Wallets that don't support silent connect reject.
    const [restoring, setRestoring] = useState(() => !!stateSync.getSelectedWallet());
    const attempted = useRef(new Set<string>());
    useEffect(() => {
        const saved = stateSync.getSelectedWallet();
        if (!saved || account) {
            setRestoring(false);
            return;
        }
        const [walletName] = saved.split(':');
        const target = wallets.find(w => w.name === walletName);
        if (!target) {
            // Wallets register asynchronously; give extensions a moment before giving up.
            const t = setTimeout(() => setRestoring(false), 1500);
            return () => clearTimeout(t);
        }
        if (attempted.current.has(target.name)) return;
        attempted.current.add(target.name);
        const feature = getWalletFeature(target, 'standard:connect') as {
            connect: (input?: { silent?: boolean }) => Promise<unknown>;
        };
        feature
            .connect({ silent: true })
            .catch(() => undefined)
            .finally(() => setTimeout(() => setRestoring(false), 300));
    }, [wallets, account]);

    // Wallet switched accounts underneath us (PRD §25 "Wrong wallet").
    const previous = useRef<string | undefined>(undefined);
    useEffect(() => {
        const prev = previous.current;
        const next = account?.address;
        if (prev && next && prev !== next) {
            toast.show({
                title: 'Wallet changed',
                body: `You're now connected as ${shortAddress(next)}.`,
            });
        }
        previous.current = next;
    }, [account?.address, toast]);

    const disconnect = useCallback(async () => {
        const w = wallet;
        setAccount(undefined);
        if (w && w.features.includes('standard:disconnect')) {
            try {
                const feature = getWalletFeature(w, 'standard:disconnect') as { disconnect: () => Promise<void> };
                await feature.disconnect();
            } catch {
                /* the selection is already cleared */
            }
        }
    }, [setAccount, wallet]);

    const signMessage = useCallback(async (message: string) => {
        if (!account || !wallet) throw new Error('Connect a wallet first.');
        const feature = getWalletFeature(wallet, 'solana:signMessage') as {
            signMessage: (input: { account: UiWalletAccount; message: Uint8Array }) => Promise<{ signature: Uint8Array }[]>;
        };
        const result = await feature.signMessage({
            account,
            message: new TextEncoder().encode(message),
        });
        const signature = result[0]?.signature;
        if (!signature) throw new Error('Wallet did not return a signature.');
        return new Uint8Array(signature);
    }, [account, wallet]);

    const value = useMemo<WalletContextValue>(
        () => ({
            account,
            wallet,
            wallets,
            select: setAccount,
            disconnect,
            restoring,
            dialogOpen,
            openDialog: () => setDialogOpen(true),
            closeDialog: () => setDialogOpen(false),
            signMessage,
        }),
        [account, wallet, wallets, setAccount, disconnect, restoring, dialogOpen, signMessage],
    );

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
    const ctx = useContext(WalletContext);
    if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
    return ctx;
}

/** Whether this account can sign on the configured cluster. */
export function accountSupportsCluster(account: UiWalletAccount) {
    return account.chains.includes(config.chain);
}
