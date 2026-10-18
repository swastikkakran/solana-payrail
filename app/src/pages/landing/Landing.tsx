import { useState } from 'react';

import { ExternalIcon } from '../../components/Icons';
import { clusterLabel, config } from '../../config';
import { shortAddress } from '../../lib/format';
import { Link } from '../../lib/router';
import { Compare } from './Compare';
import { EXAMPLE } from './example';
import { HeroCheckout } from './HeroCheckout';
import { LiveDevnet } from './LiveDevnet';
import { RailSchematic } from './RailSchematic';

const CUSTODY_ROWS: { what: string; wallet: string; payrail: string; chain: string }[] = [
    {
        what: 'Private keys',
        wallet: 'Yours alone',
        payrail: 'Never requested, never stored',
        chain: '—',
    },
    {
        what: 'Customer payments',
        wallet: 'Arrive here directly',
        payrail: 'Never in the payment path',
        chain: 'Settles the transfer',
    },
    {
        what: 'Merchant account',
        wallet: 'Signs to create it and pays its rent',
        payrail: 'Reads it',
        chain: 'Stores it at an address derived from your wallet',
    },
    {
        what: 'Accepting payments on/off',
        wallet: 'Only this wallet can switch it',
        payrail: 'Reads it',
        chain: 'Rejects any other signer',
    },
    {
        what: 'Payment verification',
        wallet: '—',
        payrail: 'Matches reference, amount, token and recipient',
        chain: 'Source of truth',
    },
    {
        what: 'Webhooks',
        wallet: '—',
        payrail: 'Signs each one with your secret, retries on failure',
        chain: '—',
    },
];

const STEPS = [
    {
        title: 'Register your wallet',
        body: 'Your wallet signs one transaction that creates your merchant account on Solana. You get an API key, API secret and webhook secret, shown once.',
    },
    {
        title: 'Create a payment request',
        body: 'Send the amount and currency from your backend. Payrail returns a Solana Pay link to show as a QR code or button.',
    },
    {
        title: 'Your customer pays your wallet',
        body: 'Payrail matches the transfer by its one-time reference key and checks the amount, token and recipient.',
    },
    {
        title: 'Receive a signed webhook',
        body: 'payment.confirmed reaches your server with an HMAC-SHA256 signature. Failed deliveries retry after 1 min, 5 min, 30 min and 2 h.',
    },
];

const STATES = [
    { state: 'caution', name: 'Pending', body: 'Created and waiting for the customer. Expires after 15 minutes.' },
    { state: 'proceed', name: 'Confirmed', body: 'Verified on-chain: reference, amount, token and recipient all matched.' },
    { state: 'stop', name: 'Failed', body: "A transfer referenced this payment but didn't pass verification." },
    { state: 'idle', name: 'Expired', body: 'No valid transfer arrived before the request expired.' },
] as const;

const PRIMITIVES: { tag: string; title: string; body: string; spec: string; next?: boolean }[] = [
    {
        tag: 'Anchor program',
        title: 'Merchant registry',
        body: 'One account per merchant, at an address derived from the merchant’s wallet. Only that wallet can switch it on or off; the program rejects any other signer.',
        spec: 'seeds = [b"merchant", wallet]',
    },
    {
        tag: 'Solana Pay',
        title: 'Reference keys',
        body: 'Every payment request carries a fresh, single-use reference key, so two orders for the same amount are never confused.',
        spec: 'solana:<wallet>?amount=25&reference=<key>',
    },
    {
        tag: '@solana/kit',
        title: 'Live detection',
        body: 'A log subscription per merchant wallet catches payments as they land. After any reconnect, a sweep of recent transactions picks up what was missed.',
        spec: 'logsNotifications({ mentions: [wallet] })',
    },
    {
        tag: 'Next',
        title: 'On-chain receipts',
        body: 'The registry program already defines payment records that Payrail’s oracle key creates and marks paid. Wiring them into the backend comes next.',
        spec: 'seeds = [b"payment", merchant, sha256(ref)]',
        next: true,
    },
];

type Tab = 'create' | 'webhook' | 'verify';

function CodePanel() {
    const [tab, setTab] = useState<Tab>('create');
    const tabs: { id: Tab; label: string }[] = [
        { id: 'create', label: 'Create payment' },
        { id: 'webhook', label: 'Webhook' },
        { id: 'verify', label: 'Verify signature' },
    ];
    return (
        <div className="code-panel">
            <div className="code-tabs" role="tablist" aria-label="Integration examples">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        id={`tab-${t.id}`}
                        aria-selected={tab === t.id}
                        aria-controls={`panel-${t.id}`}
                        className="code-tab"
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="code-body">
                {tab === 'create' && (
                    <pre className="mono">
                        <span className="c-cmd">curl</span> -X POST <span className="c-str">"$PAYRAIL_URL/api/v1/payments"</span> \{'\n'}
                        {'  '}-H <span className="c-str">"x-api-key: $PAYRAIL_API_KEY"</span> \{'\n'}
                        {'  '}-H <span className="c-str">"x-api-secret: $PAYRAIL_API_SECRET"</span> \{'\n'}
                        {'  '}-H <span className="c-str">"content-type: application/json"</span> \{'\n'}
                        {'  '}-d <span className="c-str">{`'{ "amount": 25, "currency": "USDC", "label": "Order #1024" }'`}</span>
                        {'\n\n'}
                        <span className="c-dim"># 201 Created</span>
                        {'\n'}
                        {'{\n'}
                        {'  '}<span className="c-key">"solanaPayUrl"</span>: <span className="c-str">{`"solana:${shortAddress(EXAMPLE.merchant)}?amount=25&spl-token=…&reference=…"`}</span>,{'\n'}
                        {'  '}<span className="c-key">"paymentRequestData"</span>: {'{ '}<span className="c-key">"status"</span>: <span className="c-str">"pending"</span>, … {'}'}
                        {'\n}'}
                    </pre>
                )}
                {tab === 'webhook' && (
                    <pre className="mono">
                        <span className="c-cmd">POST</span> /webhooks/payrail{'\n'}
                        <span className="c-dim">x-webhook-signature: 3f9a…c21e</span>
                        {'\n\n{\n'}
                        {'  '}<span className="c-key">"event"</span>: <span className="c-str">"payment.confirmed"</span>,{'\n'}
                        {'  '}<span className="c-key">"data"</span>: {'{\n'}
                        {'    '}<span className="c-key">"reference"</span>: <span className="c-str">{`"${shortAddress(EXAMPLE.reference)}"`}</span>,{'\n'}
                        {'    '}<span className="c-key">"amount"</span>: <span className="c-num">25</span>,{'\n'}
                        {'    '}<span className="c-key">"currency"</span>: <span className="c-str">"USDC"</span>,{'\n'}
                        {'    '}<span className="c-key">"transactionSignature"</span>: <span className="c-str">"4hTq…Wq9"</span>,{'\n'}
                        {'    '}<span className="c-key">"payerWallet"</span>: <span className="c-str">{`"${shortAddress(EXAMPLE.customer)}"`}</span>,{'\n'}
                        {'    '}<span className="c-key">"confirmedAt"</span>: <span className="c-str">"2026-10-15T10:40:35.607Z"</span>{'\n'}
                        {'  }\n}'}
                    </pre>
                )}
                {tab === 'verify' && (
                    <pre className="mono">
                        <span className="c-dim">// Hash the raw request body, not re-serialised JSON.</span>{'\n'}
                        <span className="c-cmd">const</span> expected = crypto{'\n'}
                        {'  '}.createHmac(<span className="c-str">"sha256"</span>, webhookSecret){'\n'}
                        {'  '}.update(rawBody){'\n'}
                        {'  '}.digest(<span className="c-str">"hex"</span>);{'\n\n'}
                        <span className="c-cmd">const</span> valid = crypto.timingSafeEqual({'\n'}
                        {'  '}Buffer.from(expected),{'\n'}
                        {'  '}Buffer.from(req.headers[<span className="c-str">"x-webhook-signature"</span>]){'\n'}
                        );
                    </pre>
                )}
            </div>
        </div>
    );
}

export function Landing() {
    // One clock for the checkout and the rail: replaying re-mounts both.
    const [run, setRun] = useState(0);
    return (
        <main id="main">
            <section className="hero page">
                <div className="hero-grid">
                    <div className="hero-copy">
                        <h1 className="hero-title">Your customers pay your wallet. Payrail does the rest.</h1>
                        <p className="hero-lede">
                            Payrail watches Solana for the payments you request, verifies each one, and sends your
                            server a signed webhook. Money moves from customer to merchant on-chain and never passes
                            through us.
                        </p>
                        <div className="hero-actions">
                            <Link to="/register" className="btn btn-primary btn-lg">
                                Register your wallet
                            </Link>
                            <a className="btn btn-secondary btn-lg" href={config.docsUrl} target="_blank" rel="noreferrer">
                                API reference <ExternalIcon />
                            </a>
                        </div>
                        <p className="hero-fine">SOL and USDC on Solana {clusterLabel[config.cluster]}.</p>
                    </div>
                    <HeroCheckout key={run} />
                </div>
            </section>

            <LiveDevnet />

            <section className="page flow" id="flow" aria-labelledby="flow-title">
                <h2 id="flow-title" className="flow-title">
                    Behind that checkout
                </h2>
                <RailSchematic key={run} onReplay={() => setRun(r => r + 1)} />
            </section>

            <Compare />

            <section className="section page" id="custody" aria-labelledby="custody-title">
                <div className="section-head">
                    <h2 id="custody-title">What Payrail can touch, and what it can't</h2>
                    <p>
                        Payrail is infrastructure around your wallet, not a wallet. Your merchant account lives on
                        Solana and only your wallet can change it.
                    </p>
                </div>
                <div className="custody" role="table" aria-label="Who holds what">
                    <div className="custody-row custody-row--head" role="row">
                        <span role="columnheader" className="custody-what">
                            <span className="visually-hidden">Responsibility</span>
                        </span>
                        <span role="columnheader">Your wallet</span>
                        <span role="columnheader">Payrail</span>
                        <span role="columnheader">Solana program</span>
                    </div>
                    {CUSTODY_ROWS.map(r => (
                        <div className="custody-row" role="row" key={r.what}>
                            <span role="rowheader" className="custody-what">
                                {r.what}
                            </span>
                            <span role="cell" data-col="Your wallet" className="custody-wallet">
                                {r.wallet}
                            </span>
                            <span role="cell" data-col="Payrail">
                                {r.payrail}
                            </span>
                            <span role="cell" data-col="Solana program">
                                {r.chain}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="section page" id="primitives" aria-labelledby="prim-title">
                <div className="section-head">
                    <h2 id="prim-title">Built on Solana primitives</h2>
                    <p>
                        No custody layer, no bridge, no wrapped balances. Payrail is a program, a watcher and a
                        webhook, and each piece is something you can inspect.
                    </p>
                </div>
                <ul className="prims">
                    {PRIMITIVES.map(p => (
                        <li key={p.title} className="prim">
                            <span className="prim-tag">
                                <span className="lamp" data-state={p.next ? 'caution' : 'proceed'} />
                                {p.tag}
                            </span>
                            <h3>{p.title}</h3>
                            <p>{p.body}</p>
                            <code className="prim-spec mono">{p.spec}</code>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="section page" id="developers" aria-labelledby="dev-title">
                <div className="section-head">
                    <h2 id="dev-title">From wallet to first webhook</h2>
                    <p>One signature to register, then a REST call per payment. Your backend keeps the API secret; the browser never sees it after setup.</p>
                </div>
                <div className="dev-grid">
                    <ol className="steps">
                        {STEPS.map((s, i) => (
                            <li key={s.title}>
                                <span className="step-n num" aria-hidden>
                                    {i + 1}
                                </span>
                                <div>
                                    <h3>{s.title}</h3>
                                    <p>{s.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                    <CodePanel />
                </div>
                <div className="states" aria-label="Payment statuses">
                    {STATES.map(s => (
                        <div className="state" key={s.name}>
                            <span className="state-name">
                                <span className="lamp" data-state={s.state} />
                                {s.name}
                            </span>
                            <p>{s.body}</p>
                        </div>
                    ))}
                </div>
            </section>


            <section className="closing page" aria-labelledby="closing-title">
                <div className="closing-inner">
                    <h2 id="closing-title">Your wallet is the account.</h2>
                    <p>
                        Registering takes one signature and about 0.0012 SOL of account rent, paid by your wallet. No
                        deposits, no custody, nothing to hand over.
                    </p>
                    <Link to="/register" className="btn btn-primary btn-lg">
                        Register your wallet
                    </Link>
                </div>
            </section>
        </main>
    );
}
