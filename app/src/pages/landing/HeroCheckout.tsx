import { useEffect, useState } from 'react';

import { CheckIcon } from '../../components/Icons';
import { QrCode } from '../../components/QrCode';
import { shortAddress } from '../../lib/format';
import { EXAMPLE, EXAMPLE_PAY_URL, TIMELINE } from './example';

type Phase = 'waiting' | 'landed' | 'verified' | 'confirmed' | 'delivered';

const STATUS: Record<Phase, { lamp: 'caution' | 'proceed'; title: string; detail: string; pulse?: boolean }> = {
    waiting: { lamp: 'caution', title: 'Waiting for payment', detail: 'Scan with any Solana Pay wallet', pulse: true },
    landed: { lamp: 'caution', title: 'Transfer seen on Solana', detail: 'Matching it to this order…', pulse: true },
    verified: { lamp: 'caution', title: 'Verifying', detail: 'Reference, amount, token, recipient', pulse: true },
    confirmed: { lamp: 'proceed', title: 'Paid', detail: 'Verified by Payrail' },
    delivered: { lamp: 'proceed', title: 'Paid', detail: 'Webhook delivered to your server · 200' },
};

/**
 * The customer's side of the payment drawn in the rail schematic below it. Both run on the same
 * clock (TIMELINE), so the status here changes as the transfer lands on the rail.
 */
export function HeroCheckout() {
    const [phase, setPhase] = useState<Phase>('waiting');

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setPhase('delivered');
            return;
        }
        const steps: [number, Phase][] = [
            [TIMELINE.arrive, 'landed'],
            [TIMELINE.verified, 'verified'],
            [TIMELINE.confirmed, 'confirmed'],
            [TIMELINE.webhook, 'delivered'],
        ];
        const timers = steps.map(([ms, p]) => window.setTimeout(() => setPhase(p), ms));
        return () => timers.forEach(t => window.clearTimeout(t));
    }, []);

    const s = STATUS[phase];
    const paid = phase === 'confirmed' || phase === 'delivered';

    return (
        <figure className="checkout" data-paid={paid} aria-labelledby="checkout-caption">
            <div className="co-head">
                <span className="co-merchant">{EXAMPLE.merchantName}</span>
                <span className="co-order mono">{EXAMPLE.order}</span>
            </div>

            <div className="co-body">
                <div className="co-qr">
                    <QrCode value={EXAMPLE_PAY_URL} size={148} label="Solana Pay QR code for the example order" />
                    <div className="co-paid" aria-hidden={!paid}>
                        <span className="co-paid-mark">
                            <CheckIcon width={22} height={22} />
                        </span>
                        <span>Paid</span>
                    </div>
                </div>
                <dl className="co-lines">
                    <div>
                        <dt>Pour-over beans, 1 kg</dt>
                        <dd className="mono num">22.00</dd>
                    </div>
                    <div>
                        <dt>Shipping</dt>
                        <dd className="mono num">3.00</dd>
                    </div>
                    <div className="co-total">
                        <dt>Total</dt>
                        <dd className="mono num">25.00 USDC</dd>
                    </div>
                    <div className="co-to">
                        <dt>Pays to</dt>
                        <dd className="mono">{shortAddress(EXAMPLE.merchant)}</dd>
                    </div>
                </dl>
            </div>

            <div className="co-status" aria-live="polite">
                <span className="lamp" data-state={s.lamp} data-pulse={s.pulse ? 'true' : undefined} />
                <div>
                    <strong>{s.title}</strong>
                    <span>{s.detail}</span>
                </div>
            </div>

            <figcaption id="checkout-caption" className="co-caption">
                Example checkout · Devnet USDC · reference <span className="mono">{shortAddress(EXAMPLE.reference)}</span>
            </figcaption>
        </figure>
    );
}
