import { useConnect, type UiWallet } from '@wallet-standard/react';
import { useEffect, useRef, useState } from 'react';

import { clusterLabel, config } from '../config';
import { CloseIcon, KeyOffIcon } from '../components/Icons';
import { isWalletRejection } from '../lib/errors';
import { useWallet } from './WalletProvider';

const INSTALL_LINKS = [
    { name: 'Phantom', url: 'https://phantom.com/download' },
    { name: 'Solflare', url: 'https://solflare.com/download' },
    { name: 'Backpack', url: 'https://backpack.app/download' },
];

function WalletOption({ wallet, onError }: { wallet: UiWallet; onError: (msg: string | null) => void }) {
    const { select, closeDialog } = useWallet();
    const [isConnecting, connect] = useConnect(wallet);
    const [busy, setBusy] = useState(false);

    return (
        <li>
            <button
                type="button"
                className="wallet-option"
                disabled={busy || isConnecting}
                onClick={async () => {
                    onError(null);
                    setBusy(true);
                    try {
                        const accounts = await connect();
                        const first = accounts[0];
                        if (!first) {
                            onError(`${wallet.name} didn't share an account. Unlock it and try again.`);
                            return;
                        }
                        select(first);
                        closeDialog();
                    } catch (e) {
                        onError(
                            isWalletRejection(e)
                                ? `You declined the connection in ${wallet.name}.`
                                : `Couldn't connect to ${wallet.name}. Make sure it's unlocked and try again.`,
                        );
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                {wallet.icon ? <img src={wallet.icon} alt="" /> : <span style={{ width: 32 }} />}
                <span className="name">{wallet.name}</span>
                <span className="hint">
                    {busy || isConnecting ? (
                        <>
                            <span className="spinner" /> Approve in wallet
                        </>
                    ) : (
                        'Detected'
                    )}
                </span>
            </button>
        </li>
    );
}

export function ConnectWalletDialog() {
    const { wallets, dialogOpen, closeDialog } = useWallet();
    const [error, setError] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!dialogOpen) return;
        setError(null);
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeDialog();
            if (e.key === 'Tab' && dialogRef.current) {
                const focusables = dialogRef.current.querySelectorAll<HTMLElement>('button, a[href]');
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (!first || !last) return;
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() =>
            dialogRef.current?.querySelector<HTMLElement>('.wallet-option, .install-list a, button')?.focus(),
        );
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
            previouslyFocused?.focus?.();
        };
    }, [dialogOpen, closeDialog]);

    if (!dialogOpen) return null;

    return (
        <div className="dialog-backdrop" onMouseDown={e => e.target === e.currentTarget && closeDialog()}>
            <div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="connect-title">
                <div className="dialog-head">
                    <div>
                        <h2 id="connect-title">Connect a wallet</h2>
                        <p style={{ color: 'var(--text-2)', fontSize: '0.9375rem', marginTop: 6 }}>
                            This wallet becomes your merchant identity and receives your payments on{' '}
                            {clusterLabel[config.cluster]}.
                        </p>
                    </div>
                    <button type="button" className="dialog-close" aria-label="Close" onClick={closeDialog}>
                        <CloseIcon />
                    </button>
                </div>
                <div className="dialog-body">
                    {wallets.length > 0 ? (
                        <ul className="wallet-list">
                            {wallets.map(w => (
                                <WalletOption key={w.name} wallet={w} onError={setError} />
                            ))}
                        </ul>
                    ) : (
                        <>
                            <p style={{ color: 'var(--text-2)', marginTop: 10 }}>
                                No Solana wallet was found in this browser. Install one, then reload this page.
                            </p>
                            <div className="install-list">
                                {INSTALL_LINKS.map(l => (
                                    <a key={l.name} href={l.url} target="_blank" rel="noreferrer">
                                        {l.name} <span>Install</span>
                                    </a>
                                ))}
                            </div>
                        </>
                    )}
                    {error && (
                        <p role="alert" style={{ color: '#ffb4b4', fontSize: '0.9375rem', marginTop: 14 }}>
                            {error}
                        </p>
                    )}
                    <div className="custody-note">
                        <KeyOffIcon />
                        <p>
                            Payrail only reads your public address. It will never ask for your seed phrase or
                            private key, and every transaction is approved inside your wallet.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
