/**
 * Payrail API client.
 *
 * Browser sessions use the HttpOnly `payrail_session` cookie. API credentials are
 * intentionally never persisted in this client.
 */
import { config } from '../config';
import { DEMO } from '../demo/mode';

export interface RegisterMerchantInput {
    email: string;
    webhookUrl: string;
    payoutWallet: string;
    name?: string;
}

export interface MerchantCredentials {
    apiKey: string;
    apiSecret: string;
    webhookSecret: string;
}

export interface CurrentMerchant {
    id: string;
    walletAddress: string;
    name?: string;
    email: string;
    expiresAt: string;
}

export interface WalletChallenge {
    walletAddress: string;
    message: string;
    expiresAt: string;
}

export interface WalletAuthResult {
    merchant: CurrentMerchant;
    expiresAt: string;
}

export type PaymentStatus = 'pending' | 'confirmed' | 'expired' | 'failed';

export interface Payment {
    _id: string;
    merchant: string;
    reference: string;
    amount: number;
    amountBaseUnits: string;
    currency: 'SOL' | 'USDC';
    label?: string;
    message?: string;
    status: PaymentStatus;
    transactionSignature?: string;
    payerWallet?: string;
    expiresAt?: string;
    confirmedAt?: string;
    onChainPda: string;
    onChainCreateSignature?: string;
    onChainMarkPaidSignature?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PaymentList {
    payments: Payment[];
    pagination: {
        page: number;
        limit: number;
        totalCount: number;
        totalPages: number;
    };
}

export interface CreatePaymentResult {
    solanaPayUrl: string;
    paymentRequestData: Payment;
}

export class ApiError extends Error {
    readonly status: number;
    readonly fieldErrors: Record<string, string>;
    constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.fieldErrors = fieldErrors;
    }
}

export class BackendUnavailableError extends Error {
    constructor() {
        super('Payrail is temporarily unable to reach its servers.');
        this.name = 'BackendUnavailableError';
    }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${config.apiUrl}${path}`, {
            ...init,
            credentials: 'include',
            headers: { 'content-type': 'application/json', ...init.headers },
        });
    } catch {
        throw new BackendUnavailableError();
    }

    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        /* non-JSON body */
    }

    if (!response.ok) {
        if (response.status >= 502 && response.status <= 504) throw new BackendUnavailableError();
        const envelope = (body ?? {}) as { message?: string; errors?: { field?: string | number; message: string }[] };
        const fieldErrors: Record<string, string> = {};
        for (const e of envelope.errors ?? []) {
            if (e.field !== undefined && e.field !== null) fieldErrors[String(e.field)] = e.message;
        }
        throw new ApiError(response.status, envelope.message || `Request failed (${response.status}).`, fieldErrors);
    }

    if (response.status === 204) return undefined as T;
    return (body as { data: T }).data;
}

function randomHex(bytes: number) {
    return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function registerMerchantDemo(): Promise<MerchantCredentials> {
    await new Promise(r => setTimeout(r, 650));
    return {
        apiKey: `pk_demo_${randomHex(12)}`,
        apiSecret: `sk_demo_${randomHex(20)}`,
        webhookSecret: `whsec_demo_${randomHex(16)}`,
    };
}

export function registerMerchant(input: RegisterMerchantInput) {
    if (DEMO) return registerMerchantDemo();
    return request<MerchantCredentials>('/auth/register', { method: 'POST', body: JSON.stringify(input) });
}

export function createWalletChallenge(walletAddress: string) {
    if (DEMO) {
        return Promise.resolve<WalletChallenge>({
            walletAddress,
            message: `Payrail demo sign-in\nWallet: ${walletAddress}\nThis signature does not create a transaction.`,
            expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        });
    }
    return request<WalletChallenge>('/auth/challenge', {
        method: 'POST',
        body: JSON.stringify({ walletAddress }),
    });
}

export function verifyWalletChallenge(walletAddress: string, signature: string) {
    if (DEMO) {
        try { sessionStorage.setItem('payrail:demo-session', '1'); } catch { /* memoryless browser */ }
        return Promise.resolve<WalletAuthResult>({
            merchant: {
                id: 'demo-merchant',
                walletAddress,
                name: 'Demo Merchant',
                email: 'merchant@payrail.dev',
                expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            },
            expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        });
    }
    return request<WalletAuthResult>('/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ walletAddress, signature }),
    });
}

export function getCurrentMerchant() {
    if (DEMO) {
        let authenticated = false;
        try { authenticated = sessionStorage.getItem('payrail:demo-session') === '1'; } catch { /* ignore */ }
        if (!authenticated) return Promise.reject(new ApiError(401, 'Not authenticated'));
        return Promise.resolve<CurrentMerchant>({
            id: 'demo-merchant',
            walletAddress: '',
            name: 'Demo Merchant',
            email: 'merchant@payrail.dev',
            expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        });
    }
    return request<CurrentMerchant>('/auth/me');
}

export function logoutWallet() {
    if (DEMO) {
        try { sessionStorage.removeItem('payrail:demo-session'); } catch { /* ignore */ }
        return Promise.resolve();
    }
    return request<null>('/auth/logout', { method: 'POST' });
}

export function listPayments(status?: PaymentStatus, page = 1, limit = 20) {
    if (DEMO) {
        return Promise.resolve<PaymentList>(demoPayments(page, limit, status));
    }
    // Dashboard payment access is intentionally not authenticated with a secret in the browser.
    // Until the backend exposes a session-authenticated payment read route, this is unavailable.
    return Promise.reject(new ApiError(501, 'Dashboard payment reads require the session-authenticated payment endpoint.'));
}

export function getPayment(paymentId: string) {
    if (DEMO) {
        const payment = demoPayments(1, 100).payments.find(p => p._id === paymentId);
        return payment ? Promise.resolve(payment) : Promise.reject(new ApiError(404, 'Payment not found'));
    }
    return Promise.reject(new ApiError(501, 'Dashboard payment reads require the session-authenticated payment endpoint.'));
}

export function createPayment(input: { amount: number; currency: 'SOL' | 'USDC'; label?: string; message?: string }) {
    if (DEMO) {
        const payment: Payment = {
            _id: `demo_${randomHex(8)}`,
            merchant: 'demo-merchant',
            reference: `demo-ref-${randomHex(6)}`,
            amount: input.amount,
            amountBaseUnits: input.currency === 'SOL' ? String(Math.round(input.amount * 1_000_000_000)) : String(Math.round(input.amount * 1_000_000)),
            currency: input.currency,
            label: input.label,
            message: input.message,
            status: 'pending',
            onChainPda: 'Demo PDA',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        };
        return Promise.resolve<CreatePaymentResult>({
            solanaPayUrl: `solana:${config.programId}?amount=${input.amount}&spl-token=${input.currency}`,
            paymentRequestData: payment,
        });
    }
    return request<CreatePaymentResult>('/payments', { method: 'POST', body: JSON.stringify(input) });
}

function demoPayments(page = 1, limit = 20, status?: PaymentStatus): PaymentList {
    const now = Date.now();
    const seed: Array<Partial<Payment> & Pick<Payment, '_id' | 'reference' | 'amount' | 'currency' | 'status'>> = [
        { _id: 'demo_01', reference: '7gK2…9aF', amount: 2.4, currency: 'SOL', status: 'confirmed' },
        { _id: 'demo_02', reference: '4mP8…2qL', amount: 0.84, currency: 'SOL', status: 'confirmed' },
        { _id: 'demo_03', reference: '8dR1…5wN', amount: 1.2, currency: 'USDC', status: 'pending' },
        { _id: 'demo_04', reference: '3nV7…4cQ', amount: 0.56, currency: 'SOL', status: 'confirmed' },
        { _id: 'demo_05', reference: '5kA9…1xE', amount: 18.0, currency: 'USDC', status: 'expired' },
        { _id: 'demo_06', reference: '2zT6…8pB', amount: 3.15, currency: 'SOL', status: 'confirmed' },
    ];
    const filtered = status ? seed.filter(p => p.status === status) : seed;
    const payments = filtered.map((p, i) => ({
        ...p,
        merchant: 'demo-merchant',
        amountBaseUnits: p.currency === 'SOL' ? String(Math.round(p.amount * 1e9)) : String(Math.round(p.amount * 1e6)),
        label: i % 2 ? 'Online order' : 'Checkout',
        message: 'Demo payment activity',
        transactionSignature: p.status === 'confirmed' ? `5J${'x'.repeat(84)}` : undefined,
        payerWallet: `9${'A'.repeat(43)}`,
        expiresAt: new Date(now + 15 * 60_000).toISOString(),
        confirmedAt: p.status === 'confirmed' ? new Date(now - (i + 1) * 3_600_000).toISOString() : undefined,
        onChainPda: `PDA_${i + 1}`,
        createdAt: new Date(now - (i + 1) * 3_600_000).toISOString(),
        updatedAt: new Date(now - i * 1_800_000).toISOString(),
    }));
    const start = (page - 1) * limit;
    return {
        payments: payments.slice(start, start + limit),
        pagination: { page, limit, totalCount: payments.length, totalPages: Math.max(1, Math.ceil(payments.length / limit)) },
    };
}
