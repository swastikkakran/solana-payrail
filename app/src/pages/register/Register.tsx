/**
 * Merchant registration (PRD §6–9, §25–27).
 *
 *   connect wallet → read merchant account from Solana
 *     ├─ not registered → details form → wallet signs `initialize` → confirm → POST /auth/register → credentials
 *     └─ registered     → status (active / inactive) → wallet signs `update` to switch
 *
 * The on-chain step goes first: it is the one that proves control of the wallet, and the
 * account it creates is detectable, so a failed backend save can be retried on its own
 * without asking the wallet to sign again.
 */
import type { Address } from '@solana/kit';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { KeyOffIcon } from '../../components/Icons';
import { DEMO, demoRegisterHref } from '../../demo/mode';
import { useToast } from '../../components/Toasts';
import { clusterLabel, config } from '../../config';
import { registerMerchant, type MerchantCredentials } from '../../lib/api';
import { describeApiError, describeTransactionError, type FriendlyError } from '../../lib/errors';
import { explorerTxUrl, lamportsToSol, shortAddress } from '../../lib/format';
import {
    fetchMerchant,
    getInitializeInstructionAsync,
    getUpdateInstructionAsync,
} from '../../solana/merchantRegistry';
import { sendWalletTransaction, type TxPhase } from '../../solana/sendWalletTransaction';
import { accountSupportsCluster, useWallet } from '../../wallet/WalletProvider';
import { Credentials } from './Credentials';
import { ErrorPanel } from './ErrorPanel';
import { AccountInspector, TxPreview } from './Manifest';
import { EMPTY_DETAILS, MerchantForm, type FieldErrors, type MerchantDetails } from './MerchantForm';
import { MerchantStatusPanel } from './MerchantStatusPanel';
import { ProgressLog, type ProgressStep, type StepStatus } from './ProgressLog';
import { NETWORK_FEE, useMerchantStatus } from './useMerchantStatus';

/* ── Stations along the top rail ──────────────────────────────────────────── */

const STATIONS = ['Connect wallet', 'Merchant details', 'Approve in wallet', 'Confirm on Solana', 'API credentials'];

function RailStepper({ current, complete }: { current: number; complete?: boolean }) {
    const progress = complete ? 1 : current / (STATIONS.length - 1);
    return (
        <ol className="rail-stepper" aria-label="Registration progress" style={{ ['--progress' as string]: progress }}>
            {STATIONS.map((label, i) => {
                const state = complete || i < current ? 'done' : i === current ? 'current' : 'todo';
                return (
                    <li key={label} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                        <span className="rs-dot" aria-hidden />
                        <span className="rs-n mono" aria-hidden>
                            {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="rs-label">
                            {label}
                            <span className="visually-hidden">
                                {state === 'done' ? ' (done)' : state === 'current' ? ' (current step)' : ''}
                            </span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

function Layout({
    onboarding,
    station,
    complete,
    title,
    intro,
    main,
    aside,
}: {
    onboarding: boolean;
    station: number;
    complete?: boolean;
    title: string;
    intro: ReactNode;
    main: ReactNode;
    aside: ReactNode;
}) {
    return (
        <>
            <header className="reg-head">
                <p className="reg-kicker">
                    <span className="lamp" data-state={config.cluster === 'mainnet' ? 'proceed' : 'caution'} />
                    Merchant registry · Solana {clusterLabel[config.cluster]}
                </p>
                <h1>{title}</h1>
                <p className="reg-intro">{intro}</p>
            </header>
            {onboarding && <RailStepper current={station} complete={complete} />}
            <div className="reg-grid">
                <div className="reg-main">{main}</div>
                <div className="reg-aside">{aside}</div>
            </div>
        </>
    );
}

const ONBOARD_TITLE = 'Register your wallet as a merchant';
const ONBOARD_INTRO =
    'One signature creates your Payrail merchant account on Solana. Your wallet stays its owner, its payout address and the only key that can change it.';

/* ── Not connected ───────────────────────────────────────────────────────── */

const GATE_POINTS = [
    {
        title: 'It becomes your payout address',
        body: 'Customers pay this wallet directly, on-chain. Payrail never holds funds.',
    },
    {
        title: 'It signs one registration transaction',
        body: 'That creates your merchant account. Your wallet pays about 0.0012 SOL of account rent.',
    },
    {
        title: 'It stays the only key in control',
        body: 'Only this wallet can switch your merchant account on or off.',
    },
];

function Gate({ restoring, onConnect }: { restoring: boolean; onConnect: () => void }) {
    return (
        <Layout
            onboarding
            station={0}
            title={ONBOARD_TITLE}
            intro={ONBOARD_INTRO}
            main={
                restoring ? (
                    <Checking label="Reconnecting your wallet…" />
                ) : (
                    <section className="card gate" aria-labelledby="gate-title">
                        <h2 id="gate-title">Connect the wallet you want to be paid in</h2>
                        <ol className="gate-points">
                            {GATE_POINTS.map((p, i) => (
                                <li key={p.title}>
                                    <span className="gate-n mono" aria-hidden>
                                        {i + 1}
                                    </span>
                                    <div>
                                        <strong>{p.title}</strong>
                                        <p>{p.body}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                        <div className="gate-actions">
                            <button type="button" className="btn btn-primary btn-lg" onClick={onConnect}>
                                Connect wallet
                            </button>
                            <span>Phantom, Solflare, Backpack or any Wallet Standard wallet.</span>
                        </div>
                        <p className="gate-note">
                            <KeyOffIcon />
                            Payrail reads only your public address. It never asks for a seed phrase or private key.
                        </p>
                        {!DEMO && (
                            <p className="gate-demo">
                                No wallet on this device? <a href={demoRegisterHref()}>Try the demo</a> with a simulated
                                wallet and network.
                            </p>
                        )}
                    </section>
                )
            }
            aside={<TxPreview />}
        />
    );
}

function Checking({ label }: { label: string }) {
    return (
        <section className="card checking" aria-busy="true" aria-live="polite">
            <p className="checking-label">
                <span className="lamp" data-state="caution" data-pulse="true" />
                {label}
            </p>
            <div className="skeleton" style={{ width: '62%' }} />
            <div className="skeleton" style={{ width: '88%' }} />
            <div className="skeleton skeleton-block" />
            <div className="skeleton skeleton-block" />
        </section>
    );
}

/* ── Connected ───────────────────────────────────────────────────────────── */

type Phase = TxPhase | 'saving' | 'refreshing';

type Stage =
    | { kind: 'idle' }
    | { kind: 'details'; error?: FriendlyError; fieldErrors?: FieldErrors; signature?: string }
    | { kind: 'working'; op: 'register'; phase: Phase; signature?: string }
    | { kind: 'working'; op: 'toggle'; to: 'active' | 'inactive'; phase: Phase; signature?: string }
    | { kind: 'failed'; op: 'register' | 'toggle'; error: FriendlyError; retryable: boolean }
    | { kind: 'credentials'; credentials: MerchantCredentials; signature?: string };

const PHASE_INDEX: Record<Phase, number> = {
    checking: 0,
    'awaiting-signature': 1,
    submitting: 2,
    confirming: 2,
    confirmed: 3,
    saving: 3,
    refreshing: 3,
};

function SigLink({ signature }: { signature?: string }) {
    if (!signature) return null;
    return (
        <a className="ext-link mono" href={explorerTxUrl(signature)} target="_blank" rel="noreferrer">
            {shortAddress(signature, 6, 6)} ↗
        </a>
    );
}

function buildSteps(stage: Extract<Stage, { kind: 'working' }>, walletShort: string): ProgressStep[] {
    const at = PHASE_INDEX[stage.phase];
    const status = (i: number): StepStatus => (i < at ? 'done' : i === at ? 'active' : 'todo');
    const cluster = clusterLabel[config.cluster];
    const pick = (i: number, todo: ReactNode, active: ReactNode, done: ReactNode) =>
        status(i) === 'done' ? done : status(i) === 'active' ? active : todo;

    const steps: ProgressStep[] = [
        {
            id: 'check',
            title: 'Check the transaction',
            status: status(0),
            detail: pick(0, '', `Simulating on ${cluster}…`, 'Simulation passed'),
        },
        {
            id: 'approve',
            title: 'Approve in your wallet',
            status: status(1),
            detail: pick(1, 'One transaction to review', 'Waiting for wallet approval…', `Signed by ${walletShort}`),
        },
        {
            id: 'confirm',
            title: 'Confirm on Solana',
            status: status(2),
            detail: pick(
                2,
                `Submitted to ${cluster}`,
                <>
                    {stage.phase === 'submitting' ? 'Transaction submitted…' : 'Confirming transaction…'}{' '}
                    <SigLink signature={stage.signature} />
                </>,
                <>
                    {stage.op === 'register' ? 'Merchant account created' : 'Confirmed'} <SigLink signature={stage.signature} />
                </>,
            ),
        },
    ];

    steps.push(
        stage.op === 'register'
            ? {
                  id: 'save',
                  title: 'Save your details',
                  status: status(3),
                  detail: pick(3, 'Email and webhook URL go to Payrail', 'Saving to Payrail…', 'Saved'),
              }
            : {
                  id: 'refresh',
                  title: 'Refresh merchant status',
                  status: status(3),
                  detail: pick(3, 'Read back from Solana', 'Reading your account from Solana…', 'Up to date'),
              },
    );
    return steps;
}

function workingTitle(stage: Extract<Stage, { kind: 'working' }>) {
    if (stage.op === 'toggle') return stage.to === 'active' ? 'Activating your merchant' : 'Deactivating your merchant';
    switch (stage.phase) {
        case 'checking':
            return 'Preparing your registration';
        case 'awaiting-signature':
            return 'Waiting for wallet approval';
        case 'saving':
            return 'Saving your details';
        default:
            return 'Registering your merchant account';
    }
}

function toFieldErrors(raw?: Record<string, string>): FieldErrors | undefined {
    if (!raw) return undefined;
    const out: FieldErrors = {};
    if (raw.email) out.email = raw.email;
    if (raw.webhookUrl) out.webhookUrl = raw.webhookUrl;
    if (raw.name) out.name = raw.name;
    return Object.keys(out).length ? out : undefined;
}

function Flow({ account, wallet }: { account: UiWalletAccount; wallet?: UiWallet }) {
    const address = account.address as Address;
    const toast = useToast();
    const { status, refresh } = useMerchantStatus(address);
    const [stage, setStage] = useState<Stage>({ kind: 'idle' });
    const [details, setDetails] = useState<MerchantDetails>(EMPTY_DETAILS);
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);
    const safeSet = useCallback((s: Stage) => alive.current && setStage(s), []);

    // Each stage swaps the card for one of a different height. If the user was scrolled down to the
    // submit button, bring the progress back into view instead of leaving them facing empty space.
    const viewKey = `${stage.kind}:${status.state}:${status.state === 'ready' ? String(status.data.merchant?.isActive) : ''}`;
    const firstView = useRef(true);
    useEffect(() => {
        if (firstView.current) {
            firstView.current = false;
            return;
        }
        const target = document.querySelector('.rail-stepper') ?? document.querySelector('.reg-grid');
        if (!target) return;
        const top = target.getBoundingClientRect().top;
        if (top >= 72 && top < window.innerHeight * 0.5) return;
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: window.scrollY + top - 92, behavior: smooth ? 'smooth' : 'auto' });
    }, [viewKey]);

    const walletShort = shortAddress(address);
    const clusterOk = accountSupportsCluster(account);
    const clusterError: FriendlyError = {
        title: `${wallet?.name ?? 'This wallet'} isn’t on ${clusterLabel[config.cluster]}`,
        body: `This account doesn’t offer Solana ${clusterLabel[config.cluster]}. Switch the wallet’s network to ${clusterLabel[config.cluster]}, then reconnect.`,
    };

    const saveDetails = useCallback(
        async (signature?: string) => {
            safeSet({ kind: 'working', op: 'register', phase: 'saving', signature });
            try {
                const credentials = await registerMerchant({
                    email: details.email.trim(),
                    webhookUrl: details.webhookUrl.trim(),
                    payoutWallet: address,
                    name: details.name.trim() || undefined,
                });
                safeSet({ kind: 'credentials', credentials, signature });
            } catch (e) {
                const fe = describeApiError(e);
                safeSet({ kind: 'details', error: fe, fieldErrors: toFieldErrors(fe.fieldErrors), signature });
            }
        },
        [address, details, safeSet],
    );

    const runRegister = useCallback(async () => {
        if (!clusterOk) {
            safeSet({ kind: 'failed', op: 'register', error: clusterError, retryable: false });
            return;
        }
        safeSet({ kind: 'working', op: 'register', phase: 'checking' });

        // Re-read the chain right before signing: another tab may have registered already.
        try {
            if (await fetchMerchant(address)) {
                await refresh({ quiet: true });
                toast.show({ title: 'Already registered', body: 'This wallet already has a Payrail merchant account.', tone: 'proceed' });
                safeSet({ kind: 'idle' });
                return;
            }
        } catch {
            /* the simulation below surfaces RPC problems with a better message */
        }

        let signature: string;
        try {
            signature = await sendWalletTransaction({
                account,
                buildInstruction: getInitializeInstructionAsync,
                onPhase: (phase, sig) => safeSet({ kind: 'working', op: 'register', phase, signature: sig }),
            });
        } catch (e) {
            const fe = describeTransactionError(e, 'Registration');
            if (fe.alreadyRegistered) {
                await refresh({ quiet: true });
                toast.show({ title: fe.title, body: fe.body, tone: 'proceed' });
                safeSet({ kind: 'idle' });
                return;
            }
            safeSet({ kind: 'failed', op: 'register', error: fe, retryable: true });
            return;
        }

        // Authoritative state comes from chain, not from the fact that we sent a transaction.
        void refresh({ quiet: true });
        await saveDetails(signature);
    }, [account, address, clusterOk, clusterError, refresh, safeSet, saveDetails, toast]);

    const runToggle = useCallback(
        async (currentlyActive: boolean) => {
            const to = currentlyActive ? 'inactive' : 'active';
            if (!clusterOk) {
                safeSet({ kind: 'failed', op: 'toggle', error: clusterError, retryable: false });
                return;
            }
            safeSet({ kind: 'working', op: 'toggle', to, phase: 'checking' });

            // `update` flips the flag rather than setting it, so make sure we flip from the state we showed.
            try {
                const fresh = await fetchMerchant(address);
                if (!fresh || fresh.isActive !== currentlyActive) {
                    await refresh({ quiet: true });
                    toast.show({ title: 'Status changed', body: 'Your merchant status changed elsewhere. Showing the latest.' });
                    safeSet({ kind: 'idle' });
                    return;
                }
            } catch {
                /* fall through to the simulation, which reports RPC errors */
            }

            let signature: string;
            try {
                signature = await sendWalletTransaction({
                    account,
                    buildInstruction: getUpdateInstructionAsync,
                    onPhase: (phase, sig) => safeSet({ kind: 'working', op: 'toggle', to, phase, signature: sig }),
                });
            } catch (e) {
                safeSet({
                    kind: 'failed',
                    op: 'toggle',
                    error: describeTransactionError(e, to === 'active' ? 'Activation' : 'Deactivation'),
                    retryable: true,
                });
                return;
            }
            safeSet({ kind: 'working', op: 'toggle', to, phase: 'refreshing', signature });
            await refresh({ quiet: true });
            toast.show({
                title: to === 'active' ? 'Merchant activated' : 'Merchant deactivated',
                body: to === 'active' ? 'Your merchant is accepting payments.' : 'Your merchant is marked as not accepting payments.',
                tone: to === 'active' ? 'proceed' : 'caution',
            });
            safeSet({ kind: 'idle' });
        },
        [account, address, clusterOk, clusterError, refresh, safeSet, toast],
    );

    /* ── render ── */

    const snapshot = status.state === 'ready' ? status.data : null;
    const merchant = snapshot?.merchant ?? null;
    const preview = (
        <TxPreview wallet={address} pda={snapshot?.pda} bump={snapshot?.bump} rent={snapshot?.rent} balance={snapshot?.balance} />
    );

    if (stage.kind === 'working') {
        const steps = buildSteps(stage, walletShort);
        // Stations: 0–1 check/approve → “Approve in wallet”, 2 → “Confirm on Solana”, 3 → “API credentials”.
        const at = PHASE_INDEX[stage.phase];
        const station = at <= 1 ? 2 : at === 2 ? 3 : 4;
        return (
            <Layout
                onboarding={stage.op === 'register'}
                station={station}
                title={stage.op === 'register' ? ONBOARD_TITLE : 'Your merchant account'}
                intro={stage.op === 'register' ? ONBOARD_INTRO : `Signed by ${walletShort}. Read back from Solana once confirmed.`}
                main={
                    <section className="card working" aria-live="polite" aria-labelledby="working-title">
                        <h2 id="working-title">{workingTitle(stage)}</h2>
                        <p className="working-sub">
                            Keep this tab open.{' '}
                            {stage.phase === 'awaiting-signature'
                                ? `Review the transaction in ${wallet?.name ?? 'your wallet'} and approve it.`
                                : 'Nothing else needs your attention.'}
                        </p>
                        <ProgressLog steps={steps} label="Transaction progress" />
                    </section>
                }
                aside={merchant && stage.op === 'toggle' ? <AccountInspector merchant={merchant} /> : preview}
            />
        );
    }

    if (stage.kind === 'credentials') {
        return (
            <Layout
                onboarding
                station={4}
                complete
                title="You’re registered"
                intro="Your wallet created its merchant account on Solana. Payrail will watch it for the payments you request."
                main={
                    <div className="card">
                        <Credentials
                            credentials={stage.credentials}
                            wallet={address}
                            signature={stage.signature}
                            onDone={() => {
                                setStage({ kind: 'idle' });
                                void refresh({ quiet: true });
                            }}
                        />
                    </div>
                }
                aside={merchant ? <AccountInspector merchant={merchant} /> : preview}
            />
        );
    }

    if (stage.kind === 'failed') {
        const retry = () => (stage.op === 'register' ? void runRegister() : merchant && void runToggle(merchant.isActive));
        return (
            <Layout
                onboarding={stage.op === 'register'}
                station={2}
                title={stage.op === 'register' ? ONBOARD_TITLE : 'Your merchant account'}
                intro={stage.op === 'register' ? ONBOARD_INTRO : 'Nothing changed on Solana.'}
                main={
                    <section className="card">
                        <ErrorPanel
                            error={stage.error}
                            onRetry={stage.retryable ? retry : undefined}
                            onDismiss={() => setStage({ kind: 'idle' })}
                        />
                    </section>
                }
                aside={merchant ? <AccountInspector merchant={merchant} /> : preview}
            />
        );
    }

    if (status.state === 'loading') {
        return (
            <Layout
                onboarding
                station={1}
                title={ONBOARD_TITLE}
                intro={ONBOARD_INTRO}
                main={<Checking label="Checking merchant status…" />}
                aside={<TxPreview wallet={address} />}
            />
        );
    }

    if (status.state === 'error') {
        return (
            <Layout
                onboarding
                station={1}
                title={ONBOARD_TITLE}
                intro={ONBOARD_INTRO}
                main={
                    <section className="card">
                        <ErrorPanel error={status.error} onRetry={() => void refresh()} />
                    </section>
                }
                aside={<TxPreview wallet={address} />}
            />
        );
    }

    const data = status.data;
    const total = data.rent + NETWORK_FEE;
    const short = data.balance != null && data.balance < total;

    const notices = (
        <>
            {!clusterOk && (
                <div className="notice" data-tone="stop">
                    <span className="lamp" data-state="stop" />
                    <p>
                        <strong>{clusterError.title}.</strong> {clusterError.body}
                    </p>
                </div>
            )}
            {short && (
                <div className="notice" data-tone="caution">
                    <span className="lamp" data-state="caution" />
                    <p>
                        <strong>
                            This wallet has {lamportsToSol(data.balance ?? 0n, 4)} SOL on {clusterLabel[config.cluster]}.
                        </strong>{' '}
                        Registering needs about {lamportsToSol(total, 4)} SOL for account rent and the network fee.{' '}
                        {config.cluster !== 'mainnet' && (
                            <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">
                                Get {clusterLabel[config.cluster]} SOL ↗
                            </a>
                        )}
                    </p>
                </div>
            )}
        </>
    );

    // Off-chain details only: after a failed save, or a registered merchant finishing setup.
    if (stage.kind === 'details') {
        return (
            <Layout
                onboarding
                station={4}
                title={ONBOARD_TITLE}
                intro="Your merchant account is on Solana. Save your details to get your API keys."
                main={
                    <section className="card" aria-labelledby="details-title">
                        <h2 id="details-title" className="card-title">
                            Finish your Payrail setup
                        </h2>
                        <MerchantForm
                            mode="details-only"
                            wallet={address}
                            walletName={wallet?.name}
                            walletIcon={wallet?.icon}
                            values={details}
                            onChange={setDetails}
                            onSubmit={() => void saveDetails(stage.signature)}
                            serverErrors={stage.fieldErrors}
                            banner={stage.error ?? null}
                        />
                        <p className="card-foot">
                            <button type="button" className="link-btn" onClick={() => setStage({ kind: 'idle' })}>
                                Back to merchant status
                            </button>
                        </p>
                    </section>
                }
                aside={merchant ? <AccountInspector merchant={merchant} refreshing={status.refreshing} /> : preview}
            />
        );
    }

    if (merchant) {
        return (
            <Layout
                onboarding={false}
                station={4}
                title="Your merchant account"
                intro={
                    <>
                        Read live from Solana {clusterLabel[config.cluster]} for <span className="mono">{walletShort}</span>.
                    </>
                }
                main={
                    <div className="card">
                        <MerchantStatusPanel
                            merchant={merchant}
                            wallet={address}
                            onToggle={() => void runToggle(merchant.isActive)}
                            onFinishSetup={() => setStage({ kind: 'details' })}
                        />
                    </div>
                }
                aside={<AccountInspector merchant={merchant} refreshing={status.refreshing} />}
            />
        );
    }

    return (
        <Layout
            onboarding
            station={1}
            title={ONBOARD_TITLE}
            intro={ONBOARD_INTRO}
            main={
                <section className="card" aria-labelledby="form-title">
                    <div className="card-title-row">
                        <h2 id="form-title" className="card-title">
                            Merchant details
                        </h2>
                        <span className="card-meta">
                            <span className="lamp" data-state="idle" /> Not registered
                        </span>
                    </div>
                    <MerchantForm
                        mode="full"
                        wallet={address}
                        walletName={wallet?.name}
                        walletIcon={wallet?.icon}
                        values={details}
                        onChange={setDetails}
                        onSubmit={() => void runRegister()}
                        notice={notices}
                    />
                </section>
            }
            aside={preview}
        />
    );
}

export function Register() {
    const { account, wallet, openDialog, restoring } = useWallet();
    return (
        <main id="main" className="register page">
            {account ? (
                <Flow key={account.address} account={account} wallet={wallet} />
            ) : (
                <Gate restoring={restoring} onConnect={openDialog} />
            )}
        </main>
    );
}
