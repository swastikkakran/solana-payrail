import {
    isSolanaError,
    SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
    type Signature,
} from '@solana/kit';

import { config, clusterLabel } from '../config';
import { TransactionFailedError } from '../solana/sendWalletTransaction';
import { ApiError, BackendUnavailableError } from './api';

export interface FriendlyError {
    title: string;
    body: string;
    /** Extra affordance to render next to the error. */
    action?: 'faucet' | 'retry';
    logs?: readonly string[];
    signature?: Signature;
    /** Set when the failure means the merchant account already exists. */
    alreadyRegistered?: boolean;
}

function walk(e: unknown, visit: (e: unknown) => boolean, depth = 0): boolean {
    if (!e || depth > 5) return false;
    if (visit(e)) return true;
    return walk((e as { cause?: unknown }).cause, visit, depth + 1);
}

export function isWalletRejection(e: unknown): boolean {
    return walk(e, err => {
        const code = (err as { code?: unknown }).code;
        const message = String((err as { message?: unknown }).message ?? '');
        return code === 4001 || /reject|denied|declined|cancel/i.test(message);
    });
}

function logsOf(e: unknown): readonly string[] {
    if (e instanceof TransactionFailedError) return e.logs;
    if (isSolanaError(e, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) {
        return e.context.logs ?? [];
    }
    return [];
}

const devnetFaucetBody = () =>
    config.cluster === 'mainnet'
        ? 'Add a small amount of SOL to this wallet and try again.'
        : `Add ${clusterLabel[config.cluster]} SOL to this wallet from the Solana faucet, then try again.`;

export function describeTransactionError(e: unknown, action: string): FriendlyError {
    if (isWalletRejection(e)) {
        return { title: 'Transaction cancelled', body: 'You rejected the transaction in your wallet. Nothing was sent.' };
    }

    const logs = logsOf(e);
    const joined = logs.join('\n');
    const raw = e instanceof Error ? e.message : String(e);
    const signature = e instanceof TransactionFailedError ? e.signature : undefined;

    if (/already in use/i.test(joined)) {
        return {
            title: 'Already registered',
            body: 'This wallet already has a Payrail merchant account.',
            alreadyRegistered: true,
            logs,
        };
    }
    if (/AccountNotFound/.test(raw) || /no record of a prior credit/i.test(raw + joined)) {
        return {
            title: `This wallet has no ${clusterLabel[config.cluster]} SOL`,
            body: `Registering creates a small account on Solana, and your wallet pays its rent. ${devnetFaucetBody()}`,
            action: 'faucet',
            logs,
        };
    }
    if (/insufficient (funds|lamports)|InsufficientFunds/i.test(raw + joined)) {
        return {
            title: 'Not enough SOL',
            body: `Your wallet needs a little more SOL to cover the account rent and network fee. ${devnetFaucetBody()}`,
            action: 'faucet',
            logs,
        };
    }
    if (/6000|UnauthorizedPayoutWallet/.test(raw + joined)) {
        return {
            title: `${action} failed`,
            body: 'Only the payout wallet that registered this merchant can change it. Connect that wallet and try again.',
            logs,
            signature,
        };
    }
    if (e instanceof TransactionFailedError && e.kind === 'expired') {
        return {
            title: 'Transaction expired',
            body: 'The network did not confirm the transaction in time. No changes were made. Try again.',
            action: 'retry',
            signature,
        };
    }
    if (e instanceof TransactionFailedError && e.kind === 'timeout') {
        return {
            title: 'Still waiting for confirmation',
            body: 'The transaction was sent but has not been confirmed yet. Check it in the Explorer before trying again.',
            signature,
        };
    }
    if (/fetch|network|Failed to fetch|HTTP error/i.test(raw) && !logs.length) {
        return {
            title: 'Solana RPC unreachable',
            body: `Couldn't reach the ${clusterLabel[config.cluster]} RPC endpoint. Check your connection and try again.`,
            action: 'retry',
        };
    }
    return {
        title: `${action} failed`,
        body: 'The transaction could not be completed.',
        action: 'retry',
        logs,
        signature,
    };
}

export function describeApiError(e: unknown): FriendlyError & { fieldErrors?: Record<string, string> } {
    if (e instanceof BackendUnavailableError) {
        return {
            title: 'Payrail is unreachable',
            body: 'Payrail is temporarily unable to save your details. Your on-chain merchant account is unaffected. Try again in a moment.',
            action: 'retry',
        };
    }
    if (e instanceof ApiError) {
        if (e.status === 409) {
            return {
                title: 'Email already registered',
                body: 'That email is already linked to a Payrail merchant. Use a different email.',
                fieldErrors: { email: 'This email is already registered.' },
            };
        }
        if (e.status === 429) {
            return {
                title: 'Too many attempts',
                body: 'Payrail is limiting requests from this network. Wait a few minutes and try again.',
                action: 'retry',
            };
        }
        if (e.status === 400) {
            return { title: 'Check your details', body: e.message, fieldErrors: e.fieldErrors };
        }
        return { title: 'Saving your details failed', body: e.message, action: 'retry' };
    }
    return { title: 'Saving your details failed', body: 'Something unexpected went wrong.', action: 'retry' };
}
