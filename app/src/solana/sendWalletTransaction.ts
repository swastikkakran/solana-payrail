/**
 * Builds a transaction from one instruction, asks the connected wallet to sign it, submits it
 * to the configured cluster and polls until it is confirmed.
 *
 * The private key never leaves the wallet: the browser only ever sees the signed bytes.
 *
 * Wallet choice: we prefer `solana:signTransaction` and submit through our own RPC so the
 * transaction always lands on the configured cluster. Wallets that only expose
 * `solana:signAndSendTransaction` submit it themselves; we pass the cluster as the chain.
 */
import {
    appendTransactionMessageInstruction,
    compileTransaction,
    createNoopSigner,
    createTransactionMessage,
    getBase58Decoder,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    pipe,
    setTransactionMessageFeePayer,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signAndSendTransactionMessageWithSigners,
    signTransactionMessageWithSigners,
    type Address,
    type Instruction,
    type Signature,
    type TransactionSigner,
} from '@solana/kit';
import {
    createTransactionSendingSignerFromWalletAccount,
    createTransactionSignerFromWalletAccount,
} from '@solana/wallet-account-signer';
import type { UiWalletAccount } from '@wallet-standard/react';

import { config } from '../config';
import { rpc } from './rpc';

export type TxPhase = 'checking' | 'awaiting-signature' | 'submitting' | 'confirming' | 'confirmed';

export class TransactionFailedError extends Error {
    readonly kind: 'simulation' | 'onchain' | 'expired' | 'timeout';
    readonly logs: readonly string[];
    readonly signature?: Signature;
    readonly programError?: unknown;
    constructor(
        kind: TransactionFailedError['kind'],
        message: string,
        opts: { logs?: readonly string[]; signature?: Signature; programError?: unknown } = {},
    ) {
        super(message);
        this.name = 'TransactionFailedError';
        this.kind = kind;
        this.logs = opts.logs ?? [];
        this.signature = opts.signature;
        this.programError = opts.programError;
    }
}

type BuildInstruction = (signer: TransactionSigner) => Promise<Instruction>;

export interface SendOptions {
    account: UiWalletAccount;
    buildInstruction: BuildInstruction;
    onPhase?: (phase: TxPhase, signature?: Signature) => void;
    /** Abort polling (e.g. component unmounted). Does not cancel a signature already submitted. */
    signal?: AbortSignal;
}

const SIGN_TRANSACTION = 'solana:signTransaction';
const SIGN_AND_SEND_TRANSACTION = 'solana:signAndSendTransaction';

export function walletCanSign(account: UiWalletAccount): boolean {
    return account.features.includes(SIGN_TRANSACTION) || account.features.includes(SIGN_AND_SEND_TRANSACTION);
}

function stringifyErr(err: unknown): string {
    return JSON.stringify(err, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/**
 * Dry-runs the transaction (no signature needed) so funding problems or an already-existing
 * account surface before the wallet pops up.
 */
async function simulate(feePayer: Address, instruction: Instruction) {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayer(feePayer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstruction(instruction, m),
    );
    const wire = getBase64EncodedWireTransaction(compileTransaction(message));
    const { value } = await rpc
        .simulateTransaction(wire, {
            encoding: 'base64',
            sigVerify: false,
            replaceRecentBlockhash: true,
            commitment: 'confirmed',
        })
        .send();
    if (value.err) {
        throw new TransactionFailedError('simulation', stringifyErr(value.err), {
            logs: value.logs ?? [],
            programError: value.err,
        });
    }
}

async function waitForConfirmation(signature: Signature, lastValidBlockHeight: bigint, signal?: AbortSignal) {
    const started = Date.now();
    for (;;) {
        signal?.throwIfAborted();
        const { value } = await rpc.getSignatureStatuses([signature]).send();
        const status = value[0];
        if (status) {
            if (status.err) {
                // Fetch logs for the failure panel; best effort.
                let logs: readonly string[] = [];
                try {
                    const tx = await rpc
                        .getTransaction(signature, {
                            commitment: 'confirmed',
                            encoding: 'json',
                            maxSupportedTransactionVersion: 0,
                        })
                        .send();
                    logs = tx?.meta?.logMessages ?? [];
                } catch {
                    /* ignore */
                }
                throw new TransactionFailedError('onchain', stringifyErr(status.err), {
                    logs,
                    signature,
                    programError: status.err,
                });
            }
            if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') return;
        } else {
            const blockHeight = await rpc.getBlockHeight({ commitment: 'confirmed' }).send();
            if (blockHeight > lastValidBlockHeight) {
                throw new TransactionFailedError('expired', 'Transaction expired before it was confirmed.', {
                    signature,
                });
            }
        }
        if (Date.now() - started > 90_000) {
            throw new TransactionFailedError('timeout', 'Timed out waiting for confirmation.', { signature });
        }
        await new Promise(r => setTimeout(r, 1200));
    }
}

export async function sendWalletTransaction({ account, buildInstruction, onPhase, signal }: SendOptions) {
    const canSign = account.features.includes(SIGN_TRANSACTION);
    const canSignAndSend = account.features.includes(SIGN_AND_SEND_TRANSACTION);
    if (!canSign && !canSignAndSend) {
        throw new Error('This wallet cannot sign Solana transactions.');
    }

    onPhase?.('checking');
    // The simulated copy uses a no-op signer: it carries the address but can never sign.
    const simulationIx = await buildInstruction(createNoopSigner(account.address as Address));
    await simulate(account.address as Address, simulationIx);

    const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();

    if (canSign) {
        const signer = createTransactionSignerFromWalletAccount(account, config.chain);
        const instruction = await buildInstruction(signer);
        const message = pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayerSigner(signer, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstruction(instruction, m),
        );
        onPhase?.('awaiting-signature');
        const signed = await signTransactionMessageWithSigners(message);
        const signature = getSignatureFromTransaction(signed);
        onPhase?.('submitting', signature);
        await rpc
            .sendTransaction(getBase64EncodedWireTransaction(signed), {
                encoding: 'base64',
                preflightCommitment: 'confirmed',
            })
            .send();
        onPhase?.('confirming', signature);
        await waitForConfirmation(signature, latestBlockhash.lastValidBlockHeight, signal);
        onPhase?.('confirmed', signature);
        return signature;
    }

    const signer = createTransactionSendingSignerFromWalletAccount(account, config.chain);
    const instruction = await buildInstruction(signer);
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(signer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        m => appendTransactionMessageInstruction(instruction, m),
    );
    onPhase?.('awaiting-signature');
    const signatureBytes = await signAndSendTransactionMessageWithSigners(message);
    const signature = getBase58Decoder().decode(signatureBytes) as Signature;
    onPhase?.('confirming', signature);
    await waitForConfirmation(signature, latestBlockhash.lastValidBlockHeight, signal);
    onPhase?.('confirmed', signature);
    return signature;
}
