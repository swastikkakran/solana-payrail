import type { ReactNode } from 'react';

import { CopyButton } from '../../components/CopyButton';
import { ExternalIcon } from '../../components/Icons';
import { config } from '../../config';
import { explorerAddressUrl, shortAddress } from '../../lib/format';
import type { MerchantAccount } from '../../solana/merchantRegistry';

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="fact">
            <dt>{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}

function Addr({ value, label }: { value: string; label: string }) {
    return (
        <span className="fact-addr">
            <span className="mono" title={value}>
                {shortAddress(value, 5, 5)}
            </span>
            <CopyButton value={value} label={`Copy ${label}`} />
        </span>
    );
}

export function MerchantStatusPanel({
    merchant,
    wallet,
    onToggle,
    onFinishSetup,
}: {
    merchant: MerchantAccount;
    wallet: string;
    onToggle: () => void;
    onFinishSetup: () => void;
}) {
    const active = merchant.isActive;
    return (
        <section className="status-panel" aria-labelledby="status-title">
            <div className="state-head">
                <span className="lamp lamp-lg" data-state={active ? 'proceed' : 'caution'} />
                <div>
                    <h2 id="status-title">{active ? 'Merchant active' : 'Merchant inactive'}</h2>
                    <p>
                        {active
                            ? 'This wallet is registered with Payrail and marked as accepting payments.'
                            : 'Your merchant account exists but is marked inactive on Solana. Payments to this merchant may be rejected until you activate it.'}
                    </p>
                </div>
            </div>

            <dl className="facts">
                <Fact label="Connected wallet">
                    <Addr value={wallet} label="connected wallet" />
                </Fact>
                <Fact label="Payout wallet">
                    <Addr value={merchant.payoutWallet} label="payout wallet" />
                </Fact>
                <Fact label="Registration">
                    <span className="fact-state">
                        <span className="lamp" data-state="proceed" /> Registered
                    </span>
                </Fact>
                <Fact label="Status">
                    <span className="fact-state">
                        <span className="lamp" data-state={active ? 'proceed' : 'caution'} />
                        {active ? 'Active' : 'Inactive'}
                    </span>
                </Fact>
            </dl>

            <div className="status-actions">
                {active ? (
                    <a className="btn btn-primary btn-lg" href={config.docsUrl} target="_blank" rel="noreferrer">
                        Create your first payment <ExternalIcon />
                    </a>
                ) : (
                    <button type="button" className="btn btn-primary btn-lg" onClick={onToggle}>
                        Activate merchant
                    </button>
                )}
                <a className="btn btn-secondary btn-lg" href={explorerAddressUrl(merchant.address)} target="_blank" rel="noreferrer">
                    View on Explorer <ExternalIcon />
                </a>
            </div>

            {active && (
                <div className="status-switch">
                    <div>
                        <strong>Accepting payments</strong>
                        <p>Deactivating is an on-chain change. Your wallet signs it, and you can switch back any time.</p>
                    </div>
                    <button type="button" className="btn btn-danger btn-sm" onClick={onToggle}>
                        Deactivate merchant
                    </button>
                </div>
            )}

            <p className="status-foot">
                Registered on Solana but never received API keys?{' '}
                <button type="button" className="link-btn" onClick={onFinishSetup}>
                    Finish setup
                </button>
            </p>
        </section>
    );
}
