/** From the repo: tags v2.0.0 (2026-08-22) and v2.0.1, the migration/v3 branch, and the README roadmap. */
const STOPS: {
    when: string;
    version: string;
    state: 'proceed' | 'caution' | 'idle';
    status: string;
    title: string;
    items: string[];
}[] = [
    {
        when: 'Jul 2026',
        version: 'v1',
        state: 'proceed',
        status: 'Shipped',
        title: 'Payment gateway',
        items: ['Solana Pay links with one-time reference keys', 'Live detection plus a reconciliation sweep', 'HMAC-signed webhooks with retries'],
    },
    {
        when: 'Aug 2026',
        version: 'v2.0',
        state: 'proceed',
        status: 'Shipped',
        title: 'TypeScript and @solana/kit',
        items: ['Strict TypeScript across the backend', 'Migrated from web3.js to @solana/kit', 'Rate limiting on the API'],
    },
    {
        when: 'Oct 2026',
        version: 'v3',
        state: 'caution',
        status: 'Building',
        title: 'On-chain merchant registry',
        items: [
            'Anchor program, verified end to end on Devnet',
            'Merchants register by signing in their own wallet',
            'Payment-record instructions written and tested; backend wiring next',
        ],
    },
    {
        when: 'Next',
        version: '',
        state: 'idle',
        status: 'Planned',
        title: 'Token-2022, subscriptions, dashboard',
        items: ['Token-2022 mints, including transfer fees', 'Recurring payments enforced by the program', 'Merchant dashboard for payments and settings'],
    },
];

export function Roadmap() {
    return (
        <section className="section page" id="roadmap" aria-labelledby="roadmap-title">
            <div className="section-head">
                <h2 id="roadmap-title">Where the line goes next</h2>
                <p>
                    Payrail started as a detection layer and is moving on-chain one piece at a time. Every stop below is
                    in the repository, from the first webhook to the program on Devnet.
                </p>
            </div>
            <ol className="roadmap">
                {STOPS.map(s => (
                    <li key={s.title} data-state={s.state}>
                        <span className="rm-dot" aria-hidden />
                        <div className="rm-meta">
                            <span className="mono">{s.when}</span>
                            {s.version && <span className="rm-version mono">{s.version}</span>}
                            <span className="rm-status">
                                <span className="lamp" data-state={s.state} />
                                {s.status}
                            </span>
                        </div>
                        <h3>{s.title}</h3>
                        <ul>
                            {s.items.map(i => (
                                <li key={i}>{i}</li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ol>
        </section>
    );
}
