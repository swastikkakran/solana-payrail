import { useEffect, useId, useState } from 'react';

import { copyText, CopyButton } from '../../components/CopyButton';
import { CheckIcon, CopyIcon, DownloadIcon, ExternalIcon, EyeIcon, EyeOffIcon } from '../../components/Icons';
import type { MerchantCredentials } from '../../lib/api';
import { explorerTxUrl, shortAddress } from '../../lib/format';

interface SecretRowProps {
    label: string;
    usage: string;
    value: string;
    secret?: boolean;
}

function SecretRow({ label, usage, value, secret }: SecretRowProps) {
    const [shown, setShown] = useState(!secret);
    const id = useId();
    return (
        <div className="secret">
            <div className="secret-meta">
                <span className="secret-label" id={id}>
                    {label}
                </span>
                <span className="secret-usage">{usage}</span>
            </div>
            <div className="secret-value" data-hidden={!shown}>
                <code className="mono" aria-labelledby={id}>
                    {shown ? value : '•'.repeat(Math.min(value.length, 40))}
                </code>
                <span className="secret-actions">
                    {secret && (
                        <button
                            type="button"
                            className="copy-btn"
                            onClick={() => setShown(s => !s)}
                            aria-label={shown ? `Hide ${label}` : `Show ${label}`}
                            title={shown ? 'Hide' : 'Show'}
                        >
                            {shown ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                    )}
                    <CopyButton value={value} label={`Copy ${label}`} />
                </span>
            </div>
        </div>
    );
}

function envFile(c: MerchantCredentials, wallet: string) {
    return [
        '# Payrail merchant credentials. Keep this file out of version control.',
        `# Merchant wallet: ${wallet}`,
        `PAYRAIL_API_KEY=${c.apiKey}`,
        `PAYRAIL_API_SECRET=${c.apiSecret}`,
        `PAYRAIL_WEBHOOK_SECRET=${c.webhookSecret}`,
        '',
    ].join('\n');
}

export function Credentials({
    credentials,
    wallet,
    signature,
    onDone,
}: {
    credentials: MerchantCredentials;
    wallet: string;
    signature?: string;
    onDone: () => void;
}) {
    const [stored, setStored] = useState(false);
    const [copiedAll, setCopiedAll] = useState(false);

    // The secrets exist only in this component's memory; warn before they're lost.
    useEffect(() => {
        if (stored) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [stored]);

    useEffect(() => {
        if (!copiedAll) return;
        const t = setTimeout(() => setCopiedAll(false), 1600);
        return () => clearTimeout(t);
    }, [copiedAll]);

    const download = () => {
        const blob = new Blob([envFile(credentials, wallet)], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'payrail.env';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <section className="creds" aria-labelledby="creds-title">
            <div className="state-head">
                <span className="lamp lamp-lg" data-state="proceed" />
                <div>
                    <h2 id="creds-title">Save your API credentials</h2>
                    <p>
                        Your merchant account is live on Solana and your details are saved. Store these credentials
                        now: this is the only time Payrail shows them.
                    </p>
                </div>
            </div>

            <div className="secrets">
                <SecretRow label="API key" usage="x-api-key header" value={credentials.apiKey} />
                <SecretRow label="API secret" usage="x-api-secret · server only" value={credentials.apiSecret} secret />
                <SecretRow
                    label="Webhook secret"
                    usage="verifies x-webhook-signature"
                    value={credentials.webhookSecret}
                    secret
                />
            </div>

            <div className="creds-tools">
                <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
                    <DownloadIcon /> Download .env
                </button>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={async () => setCopiedAll(await copyText(envFile(credentials, wallet)))}
                >
                    {copiedAll ? <CheckIcon /> : <CopyIcon />} {copiedAll ? 'Copied' : 'Copy all'}
                </button>
                {signature && (
                    <a className="ext-link creds-tx" href={explorerTxUrl(signature)} target="_blank" rel="noreferrer">
                        Registration tx <span className="mono">{shortAddress(signature, 6, 6)}</span> <ExternalIcon />
                    </a>
                )}
            </div>

            <p className="creds-note">
                The API secret is stored as a hash and can&rsquo;t be recovered. If you lose it, rotate your keys with{' '}
                <span className="mono">POST /auth/rotate</span>; the old pair keeps working for 24 hours.
            </p>

            <div className="creds-confirm">
                <label className="check">
                    <input type="checkbox" checked={stored} onChange={e => setStored(e.target.checked)} />
                    <span className="check-box" aria-hidden>
                        <CheckIcon width={12} height={12} />
                    </span>
                    I&rsquo;ve stored these somewhere safe
                </label>
                <button type="button" className="btn btn-primary" disabled={!stored} onClick={onDone}>
                    Continue
                </button>
            </div>
        </section>
    );
}
