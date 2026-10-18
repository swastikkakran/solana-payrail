/**
 * Payrail backend client.
 *
 * The current backend (src/routes/auth.route.ts) exposes `POST /auth/register`, which
 * stores the off-chain merchant record and returns the API credentials exactly once.
 * Response envelope: `{ statusCode, data, message, success }` (src/utils/api-response.ts).
 * Error envelope:    `{ success: false, statusCode, message, errors: [{ field, message }] }`.
 */
import { config } from '../config';
import { DEMO } from '../demo/mode';

export interface RegisterMerchantInput {
    email: string;
    webhookUrl: string;
    payoutWallet: string;
    /** Not yet in the backend's zod schema; sent so the backend can start persisting it. */
    name?: string;
}

export interface MerchantCredentials {
    apiKey: string;
    apiSecret: string;
    webhookSecret: string;
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

/** Thrown when the backend can't be reached at all (network, CORS, server down). */
export class BackendUnavailableError extends Error {
    constructor() {
        super('Payrail is temporarily unable to reach its servers.');
        this.name = 'BackendUnavailableError';
    }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${config.apiUrl}${path}`, {
            ...init,
            headers: { 'content-type': 'application/json', ...init.headers },
        });
    } catch {
        throw new BackendUnavailableError();
    }

    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        /* non-JSON body (proxy error page, etc.) */
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
    return (body as { data: T }).data;
}

function randomHex(bytes: number) {
    return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Demo mode: same shape as the backend's response, clearly marked as demo credentials. */
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
    return request<MerchantCredentials>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
    });
}
