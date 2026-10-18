import { shortAddress } from '../../lib/format';
import { EXAMPLE } from './example';

/**
 * The hero: one payment, drawn as a schematic. Money runs customer → merchant on the rail;
 * Payrail sits off the rail, watching, and talks only to the merchant's server.
 * Plays once on load (or on "Replay", which also replays the hero checkout); reduced-motion users get the end state.
 */
const EVENTS = [
    { title: 'Transfer lands', detail: 'customer → your wallet', t: '+0.4s' },
    { title: 'Payment verified', detail: 'reference, amount, token, recipient', t: '+0.6s' },
    { title: 'Status confirmed', detail: 'pending → confirmed', t: '+0.6s' },
    { title: 'Webhook delivered', detail: 'payment.confirmed, HMAC signed', t: '+0.8s' },
];

export function RailSchematic({ onReplay }: { onReplay: () => void }) {

    return (
        <figure className="schematic" aria-labelledby="schematic-caption">
            <figcaption id="schematic-caption" className="visually-hidden">
                A customer pays 25 USDC directly from their wallet to the merchant's wallet on Solana. Payrail
                watches the transfer from outside the payment path, verifies it, and sends the merchant's
                server a signed webhook.
            </figcaption>

            <div className="sch-line">
                <div className="sch-node sch-node--from">
                    <span className="sch-node-title">Customer wallet</span>
                    <span className="mono">{shortAddress(EXAMPLE.customer)}</span>
                </div>

                <div className="sch-track" aria-hidden>
                    <div className="sch-rails" />
                    <div className="sch-car">
                        <span className="mono">25.00 USDC</span>
                    </div>
                </div>

                <div className="sch-node sch-node--to">
                    <span className="sch-node-title">Your wallet</span>
                    <span className="mono">{shortAddress(EXAMPLE.merchant)}</span>
                    <span className="sch-credit mono num">+25.00 USDC</span>
                </div>
            </div>

            <div className="sch-side" aria-hidden>
                <div className="sch-watch">
                    <span className="sch-watch-line" />
                    <span className="sch-watch-label">watches, never holds</span>
                </div>
                <div className="sch-services">
                    <div className="sch-box sch-box--payrail">
                        <span className="sch-box-title">Payrail</span>
                        <span className="sch-box-sub">verifies the transfer</span>
                    </div>
                    <div className="sch-wire">
                        <span className="sch-wire-line" />
                        <span className="sch-wire-label">signed webhook</span>
                    </div>
                    <div className="sch-box sch-box--server">
                        <span className="sch-box-title">Your server</span>
                        <span className="sch-box-sub mono">POST /webhooks/payrail</span>
                    </div>
                </div>
            </div>

            <ol className="sch-log">
                {EVENTS.map((e, i) => (
                    <li key={e.title} style={{ ['--i' as string]: i }}>
                        <span className="lamp" data-state="proceed" />
                        <span className="sch-log-title">{e.title}</span>
                        <span className="sch-log-detail">{e.detail}</span>
                    </li>
                ))}
                <li className="sch-replay">
                    <button type="button" className="btn btn-quiet btn-sm" onClick={onReplay}>
                        Replay
                    </button>
                </li>
            </ol>
        </figure>
    );
}
