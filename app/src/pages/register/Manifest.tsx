import type { ReactNode } from 'react';

import { CopyButton } from '../../components/CopyButton';
import { ExternalIcon, KeyOffIcon } from '../../components/Icons';
import { clusterLabel, config } from '../../config';
import { explorerAddressUrl, lamportsToSol, shortAddress } from '../../lib/format';
import type { MerchantAccount } from '../../solana/merchantRegistry';
import { INITIALIZE_DISCRIMINATOR, SYSTEM_PROGRAM_ADDRESS } from '../../solana/merchantRegistry';
import { FALLBACK_RENT, NETWORK_FEE } from './useMerchantStatus';

function AddressValue({ value, label }: { value: string; label: string }) {
    return (
        <span className="mf-addr">
            <a className="mono" href={explorerAddressUrl(value)} target="_blank" rel="noreferrer" title={value}>
                {shortAddress(value, 4, 4)}
                <ExternalIcon />
            </a>
            <CopyButton value={value} label={`Copy ${label}`} />
        </span>
    );
}

function Row({ k, children, sub }: { k: string; children: ReactNode; sub?: ReactNode }) {
    return (
        <div className="mf-row">
            <dt>
                {k}
                {sub && <span className="mf-sub">{sub}</span>}
            </dt>
            <dd>{children}</dd>
        </div>
    );
}

/** The registration transaction, spelled out before the wallet pops up (PRD §27 "Explain what will happen"). */
const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

/** Exactly what goes into the instruction, for anyone who wants to check it against the program. */
function InstructionBytes({ wallet, pda, bump }: { wallet?: string; pda?: string; bump?: number }) {
    return (
        <details className="mf-raw">
            <summary>Instruction bytes</summary>
            <dl>
                <div>
                    <dt>data</dt>
                    <dd>
                        <code className="mono">{hex(INITIALIZE_DISCRIMINATOR)}</code>
                        <span>sha256("global:initialize")[0..8], no arguments</span>
                    </dd>
                </div>
                <div>
                    <dt>seeds</dt>
                    <dd>
                        <code className="mono">["merchant", {wallet ? shortAddress(wallet, 4, 4) : 'wallet'}]</code>
                        <span>{bump !== undefined ? `bump ${bump}` : 'bump found after connect'}</span>
                    </dd>
                </div>
                <div>
                    <dt>accounts</dt>
                    <dd>
                        <code className="mono">
                            0 {wallet ? shortAddress(wallet, 4, 4) : 'wallet'}  writable, signer{'\n'}1 {pda ? shortAddress(pda, 4, 4) : 'pda'}  writable{'\n'}2 {shortAddress(SYSTEM_PROGRAM_ADDRESS, 4, 4)}  readonly
                        </code>
                    </dd>
                </div>
            </dl>
        </details>
    );
}

export function TxPreview({
    wallet,
    pda,
    bump,
    rent,
    balance,
}: {
    wallet?: string;
    pda?: string;
    bump?: number;
    rent?: bigint;
    balance?: bigint | null;
}) {
    // Rent for a 42-byte account is fixed by the cluster's rent rules; show it before we can ask the RPC.
    rent ??= FALLBACK_RENT;
    const total = rent + NETWORK_FEE;
    const short = balance != null && balance < total;

    return (
        <aside className="manifest" aria-labelledby="mf-title">
            <header className="mf-head">
                <h2 id="mf-title">What your wallet signs</h2>
                <span className="mf-chip mono">initialize</span>
            </header>

            <dl className="mf-list">
                <Row k="Program" sub="Payrail merchant registry">
                    <AddressValue value={config.programId} label="program address" />
                </Row>
                <Row k="Network">
                    <span className="mf-net">
                        <span className="lamp" data-state={config.cluster === 'mainnet' ? 'proceed' : 'caution'} />
                        Solana {clusterLabel[config.cluster]}
                    </span>
                </Row>
            </dl>

            <h3 className="mf-section">Accounts</h3>
            <ol className="mf-accounts">
                <li>
                    <span className="mf-idx mono">0</span>
                    <div className="mf-acct">
                        <strong>Your wallet</strong>
                        <span>Signer · pays rent and fee</span>
                    </div>
                    {wallet ? <AddressValue value={wallet} label="wallet address" /> : <span className="mf-pending">Not connected</span>}
                </li>
                <li>
                    <span className="mf-idx mono">1</span>
                    <div className="mf-acct">
                        <strong>Merchant account</strong>
                        <span>New · address derived from your wallet</span>
                    </div>
                    {pda ? <AddressValue value={pda} label="merchant account address" /> : <span className="mf-pending">After connect</span>}
                </li>
                <li>
                    <span className="mf-idx mono">2</span>
                    <div className="mf-acct">
                        <strong>System program</strong>
                        <span>Allocates the account</span>
                    </div>
                    <span className="mono mf-static">{shortAddress(SYSTEM_PROGRAM_ADDRESS, 4, 4)}</span>
                </li>
            </ol>
            <InstructionBytes wallet={wallet} pda={pda} bump={bump} />

            <h3 className="mf-section">Cost, paid by your wallet</h3>
            <dl className="mf-list mf-cost">
                <Row k="Account rent" sub="Held in your merchant account">
                    <span className="mono num">{lamportsToSol(rent)} SOL</span>
                </Row>
                <Row k="Network fee">
                    <span className="mono num">{lamportsToSol(NETWORK_FEE)} SOL</span>
                </Row>
                <Row k="Total">
                    <span className="mono num mf-total">{lamportsToSol(total)} SOL</span>
                </Row>
                {balance != null && (
                    <Row k="Your balance">
                        <span className="mf-balance" data-short={short}>
                            <span className="lamp" data-state={short ? 'stop' : 'proceed'} />
                            <span className="mono num">{lamportsToSol(balance, 4)} SOL</span>
                        </span>
                    </Row>
                )}
            </dl>

            <p className="mf-foot">
                <KeyOffIcon />
                <span>
                    Built in this browser and sent from your wallet straight to Solana. Payrail&rsquo;s servers never
                    see your keys or sign for you.
                </span>
            </p>
        </aside>
    );
}

/** Once registered: the merchant account exactly as the program stores it. */
export function AccountInspector({ merchant, refreshing }: { merchant: MerchantAccount; refreshing?: boolean }) {
    return (
        <aside className="manifest" aria-labelledby="mf-title" aria-busy={refreshing}>
            <header className="mf-head">
                <h2 id="mf-title">On-chain merchant account</h2>
                <span className="mf-chip mono">Merchant</span>
            </header>
            <dl className="mf-list">
                <Row k="Address" sub="Derived from your wallet">
                    <AddressValue value={merchant.address} label="merchant account address" />
                </Row>
                <Row k="Owner program">
                    <AddressValue value={config.programId} label="program address" />
                </Row>
                <Row k="payout_wallet">
                    <AddressValue value={merchant.payoutWallet} label="payout wallet" />
                </Row>
                <Row k="is_active">
                    <span className="mf-net">
                        <span className="lamp" data-state={merchant.isActive ? 'proceed' : 'caution'} />
                        <span className="mono">{merchant.isActive ? 'true' : 'false'}</span>
                    </span>
                </Row>
                <Row k="bump">
                    <span className="mono num">{merchant.bump}</span>
                </Row>
                <Row k="Rent held">
                    <span className="mono num">{lamportsToSol(merchant.lamports)} SOL</span>
                </Row>
                <Row k="Network">
                    <span className="mf-net">
                        <span className="lamp" data-state={config.cluster === 'mainnet' ? 'proceed' : 'caution'} />
                        Solana {clusterLabel[config.cluster]}
                    </span>
                </Row>
            </dl>
            <p className="mf-foot">
                <KeyOffIcon />
                <span>
                    Read directly from Solana. Only <span className="mono">payout_wallet</span> can change this
                    account; the program rejects every other signer.
                </span>
            </p>
        </aside>
    );
}
