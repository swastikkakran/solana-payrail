/**
 * Demo mode: the real pages and the real transaction-building code, with the wallet, the Solana
 * network and Payrail's API simulated in this browser. Nothing leaves the page.
 *
 * Turn on with `?demo` (sticks for the browser tab), off with `?demo=off` or the banner.
 * A build with VITE_DEMO=always is permanently in demo mode (used for the hosted preview).
 */
const KEY = 'payrail:demo';
const STATE_KEYS = ['payrail:demo', 'payrail:demo-chain', 'payrail:demo-wallet'];

export const DEMO_LOCKED = import.meta.env.VITE_DEMO === 'always';

function read(): boolean {
    if (DEMO_LOCKED) return true;
    const q = new URLSearchParams(window.location.search);
    try {
        if (q.has('demo')) {
            const on = !['0', 'off', 'false'].includes(q.get('demo') ?? '');
            if (on) sessionStorage.setItem(KEY, '1');
            else sessionStorage.removeItem(KEY);
            return on;
        }
        return sessionStorage.getItem(KEY) === '1';
    } catch {
        return q.has('demo') && q.get('demo') !== 'off';
    }
}

export const DEMO = read();

function clearState(keepFlag: boolean) {
    try {
        for (const k of STATE_KEYS) if (!(keepFlag && k === KEY)) sessionStorage.removeItem(k);
        localStorage.removeItem('payrail:selected-wallet');
    } catch {
        /* storage unavailable: state lived in memory only */
    }
}

function withoutDemoParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete('demo');
    return url.toString();
}

/** Forget the simulated merchant and wallet, stay in demo mode. */
export function resetDemo() {
    clearState(true);
    window.location.reload();
}

export function exitDemo() {
    clearState(false);
    const url = new URL(withoutDemoParam());
    url.searchParams.set('demo', 'off');
    window.location.href = url.toString();
}

/** Full-page link into demo mode on the register page, for either router mode. */
export function demoRegisterHref() {
    if (import.meta.env.VITE_ROUTER === 'hash') return `${window.location.pathname}?demo#/register`;
    return '/register?demo';
}
