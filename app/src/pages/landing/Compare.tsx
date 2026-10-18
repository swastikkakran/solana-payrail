/**
 * The same $25 order through a card processor and through Payrail.
 * Card figures: Stripe's published US standard pricing and default US settlement timing.
 * Solana figures: base fee per signature from the Solana docs; slot time from the Solana upgrade page.
 */
const SOURCES = [
    { label: 'Stripe pricing', href: 'https://stripe.com/pricing' },
    { label: 'Stripe payouts and settlement timing', href: 'https://docs.stripe.com/payouts' },
    { label: 'Solana transaction fees', href: 'https://solana.com/docs/core/fees' },
    { label: 'Solana reduced slot times', href: 'https://solana.com/upgrades/reduced-slot-times' },
];

const FACTS = [
    { value: '200 ms', label: 'Solana slot time on mainnet, down from 400 ms since October 9, 2026' },
    { value: '0.000005 SOL', label: 'Base network fee per signature, paid by the customer’s wallet' },
    { value: '1 transfer', label: 'Customer wallet to merchant wallet. Nothing sits in between' },
];

interface Line {
    k: string;
    v: string;
    tone?: 'minus' | 'total';
}

const CARD: Line[] = [
    { k: 'Order total', v: '$25.00' },
    { k: 'Processing fee, 2.9% + 30¢', v: '−$1.03', tone: 'minus' },
    { k: 'You receive', v: '$23.97', tone: 'total' },
];
const PAYRAIL: Line[] = [
    { k: 'Order total', v: '25.00 USDC' },
    { k: 'Processing fee', v: '0.00', tone: 'minus' },
    { k: 'You receive', v: '25.00 USDC', tone: 'total' },
];

const CARD_TERMS = [
    { k: 'Available', v: 'T+2 business days, then paid out to your bank' },
    { k: 'Held by', v: 'The processor, until payout' },
    { k: 'Disputes', v: 'Customers can charge back. $15 per dispute received' },
];
const PAYRAIL_TERMS = [
    { k: 'Available', v: 'In your wallet when the transfer confirms' },
    { k: 'Held by', v: 'Nobody. It never leaves Solana' },
    { k: 'Disputes', v: 'Transfers are final. Refunds are yours to send' },
];

function Receipt({
    title,
    sub,
    lines,
    terms,
    accent,
}: {
    title: string;
    sub: string;
    lines: Line[];
    terms: { k: string; v: string }[];
    accent?: boolean;
}) {
    return (
        <article className="receipt" data-accent={accent}>
            <header className="rc-head">
                <h3>{title}</h3>
                <span>{sub}</span>
            </header>
            <dl className="rc-lines">
                {lines.map(l => (
                    <div key={l.k} data-tone={l.tone}>
                        <dt>{l.k}</dt>
                        <dd className="mono num">{l.v}</dd>
                    </div>
                ))}
            </dl>
            <dl className="rc-terms">
                {terms.map(t => (
                    <div key={t.k}>
                        <dt>{t.k}</dt>
                        <dd>{t.v}</dd>
                    </div>
                ))}
            </dl>
        </article>
    );
}

export function Compare() {
    return (
        <section className="section page" id="compare" aria-labelledby="compare-title">
            <div className="section-head">
                <h2 id="compare-title">What a $25 order costs to accept</h2>
                <p>
                    The same order through a card processor and through Payrail on Solana. Card figures are Stripe&rsquo;s
                    published US standard pricing.
                </p>
            </div>

            <ul className="facts-strip">
                {FACTS.map(f => (
                    <li key={f.value}>
                        <span className="fs-value">{f.value}</span>
                        <span className="fs-label">{f.label}</span>
                    </li>
                ))}
            </ul>

            <div className="receipts">
                <Receipt title="Card processor" sub="Stripe, US standard" lines={CARD} terms={CARD_TERMS} />
                <Receipt title="Payrail on Solana" sub="USDC, straight to your wallet" lines={PAYRAIL} terms={PAYRAIL_TERMS} accent />
            </div>

            <p className="sources">
                Sources:{' '}
                {SOURCES.map((s, i) => (
                    <span key={s.href}>
                        <a href={s.href} target="_blank" rel="noreferrer">
                            {s.label}
                        </a>
                        {i < SOURCES.length - 1 ? ' · ' : ''}
                    </span>
                ))}
                . Stripe fee rounded to the cent.
            </p>
        </section>
    );
}
