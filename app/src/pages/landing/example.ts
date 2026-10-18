/**
 * One example payment, shared by the hero checkout and the rail schematic so the addresses agree.
 * The addresses are random keys nobody holds. The token is Devnet USDC (the backend README's
 * USDC_MINT_ADDRESS), which doesn't exist on mainnet, so scanning the QR can't move real money.
 */
export const EXAMPLE = {
    merchant: 'GwXivB6CWFCHX113qfqSSryfo878yHcq9ob1KdAUJRAo',
    customer: 'FSmp8sqymw1A4WdgyvhwF8Qk18KMqtb4sr1aq4VQZJCX',
    reference: '7ZtGMKE6ks57y3hU8yG5YisRwWaqGN8JUbKvJKwrwT3P',
    devnetUsdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    merchantName: 'Acme Coffee Roasters',
    order: 'Order #1024',
    amount: '25',
} as const;

/** Solana Pay transfer request, as the backend's POST /payments returns it. */
export const EXAMPLE_PAY_URL =
    `solana:${EXAMPLE.merchant}?amount=${EXAMPLE.amount}&spl-token=${EXAMPLE.devnetUsdc}` +
    `&reference=${EXAMPLE.reference}&label=${encodeURIComponent(EXAMPLE.merchantName)}` +
    `&message=${encodeURIComponent(EXAMPLE.order)}`;

/** Timeline shared with the CSS in landing.css (.schematic): the transfer lands at 1.85 s. */
export const TIMELINE = {
    arrive: 1850,
    verified: 1850 + 380,
    confirmed: 1850 + 2 * 380,
    webhook: 1850 + 3 * 380,
};
