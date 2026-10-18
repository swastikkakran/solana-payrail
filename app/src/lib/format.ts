import { config } from '../config';

/** 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU → 7xK…sU-style, keeping head and tail. */
export function shortAddress(value: string, head = 4, tail = 4): string {
    if (value.length <= head + tail + 1) return value;
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function clusterParam() {
    if (config.cluster === 'mainnet') return '';
    return `?cluster=${config.cluster}`;
}

export function explorerAddressUrl(addr: string) {
    return `https://explorer.solana.com/address/${addr}${clusterParam()}`;
}

export function explorerTxUrl(signature: string) {
    return `https://explorer.solana.com/tx/${signature}${clusterParam()}`;
}

const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Exact lamports → SOL string with trailing zeros trimmed (no float rounding). */
export function lamportsToSol(lamports: bigint, maxDecimals = 9): string {
    const whole = lamports / LAMPORTS_PER_SOL;
    const frac = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').slice(0, maxDecimals).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole.toString();
}
