import { useEffect, useRef, useState } from 'react';

import { useToast } from '../components/Toasts';
import { clusterLabel, config } from '../config';
import { lamportsToSol, shortAddress } from '../lib/format';
import { subscribe, type ApprovalRequest } from './approval';
import { DEMO_LOCKED, exitDemo, resetDemo } from './mode';

export function DemoBanner() {
    return (
        <div className="demo-banner" role="region" aria-label="Demo mode">
            <div className="page">
                <span className="demo-tag">
                    <span className="lamp" data-state="caution" />
                    Demo mode
                </span>
                <p>The wallet, the {clusterLabel[config.cluster]} network and Payrail&rsquo;s API are simulated in this browser. Nothing is sent to Solana.</p>
                <span className="demo-actions">
                    <button type="button" className="link-btn" onClick={resetDemo}>
                        Reset
                    </button>
                    {!DEMO_LOCKED && (
                        <button type="button" className="link-btn" onClick={exitDemo}>
                            Exit demo
                        </button>
                    )}
                </span>
            </div>
        </div>
    );
}

/** Simulated addresses and signatures don't exist on Explorer; say so instead of opening an empty page. */
export function DemoExplorerGuard() {
    const toast = useToast();
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const a = (e.target as HTMLElement | null)?.closest?.('a[href*="explorer.solana.com"]') as HTMLAnchorElement | null;
            if (!a || a.href.includes(config.programId)) return;
            e.preventDefault();
            toast.show({
                title: 'Simulated in demo mode',
                body: 'This address or transaction only exists in the demo, so Solana Explorer has no record of it.',
            });
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [toast]);
    return null;
}

const INSTRUCTION_COPY = {
    initialize: { title: 'Create merchant account', cost: 1_183_200n + 5_000n },
    update: { title: 'Switch accepting payments', cost: 5_000n },
    unknown: { title: 'Unknown instruction', cost: 5_000n },
} as const;

/** Looks and behaves like a wallet extension popup, so the signing step is visible on stage. */
export function DemoWalletPrompt() {
    const [req, setReq] = useState<ApprovalRequest | null>(null);
    const approveRef = useRef<HTMLButtonElement>(null);

    useEffect(() => subscribe(setReq), []);
    useEffect(() => {
        if (!req) return;
        requestAnimationFrame(() => approveRef.current?.focus());
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && req.resolve(false);
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [req]);

    if (!req) return null;
    const sign = req.kind === 'sign' ? req : null;
    const message = req.kind === 'message' ? req : null;
    const copy = sign ? INSTRUCTION_COPY[sign.instruction] : null;

    return (
        <div className="dw-layer">
            <div className="dw" role="dialog" aria-modal="true" aria-labelledby="dw-title">
                <div className="dw-head">
                    <span className="dw-brand">
                        <span className="dw-icon" aria-hidden />
                        Demo Wallet
                    </span>
                    <span className="dw-chip">Simulated</span>
                </div>
                <div className="dw-origin">
                    <span className="mono">{window.location.host || 'payrail'}</span>
                    <span>
                        <span className="lamp" data-state="caution" /> {clusterLabel[config.cluster]}
                    </span>
                </div>

                {sign && copy ? (
                    <>
                        <h2 id="dw-title">Approve transaction</h2>
                        <p className="dw-sub">{copy.title}</p>
                        <dl className="dw-list">
                            <div><dt>Program</dt><dd className="mono">{shortAddress(sign.program || config.programId)}</dd></div>
                            <div><dt>Instruction</dt><dd className="mono">{sign.instruction}</dd></div>
                            <div><dt>Accounts</dt><dd>{sign.accounts.length}</dd></div>
                            <div><dt>Estimated cost</dt><dd className="mono num">{lamportsToSol(copy.cost)} SOL</dd></div>
                        </dl>
                    </>
                ) : message ? (
                    <>
                        <h2 id="dw-title">Approve sign-in</h2>
                        <p className="dw-sub">This is an off-chain signature. It does not create a transaction or move funds.</p>
                        <div className="dw-message">{message.message}</div>
                    </>
                ) : (
                    <>
                        <h2 id="dw-title">Connect to Payrail</h2>
                        <p className="dw-sub">Payrail will see this wallet&rsquo;s public address. It can&rsquo;t move funds without your approval.</p>
                    </>
                )}

                <div className="dw-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => req.resolve(false)}>
                        {sign || message ? 'Reject' : 'Cancel'}
                    </button>
                    <button ref={approveRef} type="button" className="btn btn-primary" onClick={() => req.resolve(true)}>
                        {sign || message ? 'Approve' : 'Connect'}
                    </button>
                </div>
            </div>
        </div>
    );
}
