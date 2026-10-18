import { useEffect, useRef, useState } from 'react';

import { CaretIcon, ExternalIcon, LogoutIcon, CopyIcon, CheckIcon } from '../components/Icons';
import { copyText } from '../components/CopyButton';
import { explorerAddressUrl, shortAddress } from '../lib/format';
import { useWallet } from './WalletProvider';

export function WalletButton({ size = 'md' }: { size?: 'md' | 'lg' }) {
    const { account, wallet, openDialog, disconnect, restoring } = useWallet();
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    useEffect(() => {
        if (!copied) return;
        const t = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(t);
    }, [copied]);

    if (!account) {
        return (
            <button
                type="button"
                className={`btn btn-primary ${size === 'lg' ? 'btn-lg' : 'btn-sm'}`}
                onClick={openDialog}
                disabled={restoring}
                aria-busy={restoring}
            >
                {restoring ? 'Reconnecting…' : 'Connect wallet'}
            </button>
        );
    }

    return (
        <div ref={rootRef} style={{ position: 'relative' }}>
            <button
                type="button"
                className="wallet-trigger"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
            >
                {wallet?.icon && <img src={wallet.icon} alt="" />}
                <span className="mono">{shortAddress(account.address)}</span>
                <CaretIcon className="caret" />
            </button>
            {open && (
                <div className="menu" role="menu">
                    <div className="menu-head">
                        <span className="label">Connected with {wallet?.name ?? 'wallet'}</span>
                        <span className="mono">{account.address}</span>
                    </div>
                    <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        onClick={async () => setCopied(await copyText(account.address))}
                    >
                        {copied ? <CheckIcon /> : <CopyIcon />} {copied ? 'Copied' : 'Copy address'}
                    </button>
                    <a
                        role="menuitem"
                        className="menu-item"
                        href={explorerAddressUrl(account.address)}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <ExternalIcon width={16} height={16} /> View on Explorer
                    </a>
                    <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        onClick={async () => {
                            setOpen(false);
                            await disconnect();
                        }}
                    >
                        <LogoutIcon /> Disconnect
                    </button>
                </div>
            )}
        </div>
    );
}
