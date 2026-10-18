import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { address } from '@solana/kit';
import { config, clusterLabel } from '../../config';
import { DEMO } from '../../demo/mode';
import { useToast } from '../../components/Toasts';
import { CopyButton } from '../../components/CopyButton';
import { ExternalIcon, LogoutIcon, RailMark, WalletIcon } from '../../components/Icons';
import { QrCode } from '../../components/QrCode';
import { Link, useNavigate, useRouter } from '../../lib/router';
import { explorerAddressUrl, explorerTxUrl, shortAddress } from '../../lib/format';
import {
    ApiError,
    BackendUnavailableError,
    createPayment,
    getPayment,
    createWalletChallenge,
    getCurrentMerchant,
    listPayments,
    logoutWallet,
    verifyWalletChallenge,
    type CurrentMerchant,
    type Payment,
    type PaymentStatus,
} from '../../lib/api';
import { getUpdateInstructionAsync } from '../../solana/merchantRegistry';
import { useMerchantStatus } from '../register/useMerchantStatus';
import { sendWalletTransaction } from '../../solana/sendWalletTransaction';
import { useWallet } from '../../wallet/WalletProvider';
import { WalletButton } from '../../wallet/WalletButton';

const nav = [
    { path: '/dashboard', label: 'Overview', icon: 'grid' },
    { path: '/dashboard/payments', label: 'Payments', icon: 'arrow' },
    { path: '/dashboard/developer', label: 'Developer', icon: 'code' },
    { path: '/dashboard/settings', label: 'Settings', icon: 'settings' },
] as const;


function Icon({ name }: { name: string }) {
    const common = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    if (name === 'grid') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    if (name === 'arrow') return <svg {...common}><path d="M4 12h15"/><path d="m14 7 5 5-5 5"/><path d="M4 5v14"/></svg>;
    if (name === 'code') return <svg {...common}><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 4-4 16"/></svg>;
    return <svg {...common}><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="3.5"/></svg>;
}

function formatDate(value?: string) {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function money(payment: Payment) {
    return `${payment.amount.toLocaleString(undefined, { maximumFractionDigits: payment.currency === 'USDC' ? 2 : 6 })} ${payment.currency}`;
}

function StatusPill({ status }: { status: PaymentStatus }) {
    const label = status === 'confirmed' ? 'Paid' : status.charAt(0).toUpperCase() + status.slice(1)
    return <span className={`dash-status dash-status-${status}`}><i />{label}</span>;
}

function DemoChart() {
    const values = [32, 48, 42, 68, 55, 74, 62, 92, 71, 88, 78, 100];
    const points = values.map((v, i) => `${i * 9.09},${100 - v}`).join(' ');
    return (
        <div className="dash-chart" aria-label="Payment volume trend">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
                <defs><linearGradient id="payrail-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopOpacity=".18"/><stop offset="1" stopOpacity="0"/></linearGradient></defs>
                <polygon points={`0,100 ${points} 100,100`} fill="url(#payrail-area)" />
                <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="dash-chart-axis"><span>7 days ago</span><span>Today</span></div>
        </div>
    );
}

function AuthGate({ onAuthenticated }: { onAuthenticated: (merchant: CurrentMerchant) => void }) {
    const { account, wallet, openDialog, signMessage } = useWallet();
    const toast = useToast();
    const [busy, setBusy] = useState(false);

    const signIn = async () => {
        if (!account) { openDialog(); return; }
        setBusy(true);
        try {
            const challenge = await createWalletChallenge(account.address);
            const signature = await signMessage(challenge.message);
            const encoded = btoa(String.fromCharCode(...signature));
            const result = await verifyWalletChallenge(account.address, encoded);
            onAuthenticated(result.merchant);
            toast.show({ title: 'Welcome back', body: 'Your Payrail dashboard is ready.', tone: 'proceed' });
        } catch (e) {
            const message = e instanceof ApiError ? e.message : e instanceof BackendUnavailableError ? e.message : 'Your wallet did not complete the sign-in request.';
            toast.show({ title: 'Could not sign in', body: message, tone: 'stop' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="dash-auth-page">
            <div className="dash-auth-glow" />
            <section className="dash-auth-card">
                <div className="dash-auth-mark"><RailMark size={46} /></div>
                <span className="eyebrow">MERCHANT CONSOLE</span>
                <h1>Run your payments<br /><em>from one place.</em></h1>
                <p>Connect the wallet that owns your merchant account. Payrail uses a signed challenge to authenticate you — no password and no transaction.</p>
                <div className="dash-auth-wallet"><WalletIcon /><span>{account ? shortAddress(account.address, 7, 7) : 'Wallet not connected'}</span>{account && <span className="dash-online">Connected</span>}</div>
                <button className="btn btn-primary btn-lg dash-auth-cta" onClick={signIn} disabled={busy}>
                    {busy ? 'Signing in…' : account ? 'Sign in with wallet' : 'Connect wallet'}
                </button>
                <p className="dash-auth-note">{wallet?.name ? `Using ${wallet.name}. ` : ''}The signature never moves funds.</p>
            </section>
        </main>
    );
}

function DashboardShell({ merchant, setMerchant, children }: { merchant: CurrentMerchant; setMerchant: (m: CurrentMerchant | null) => void; children: ReactNode }) {
    const { path } = useRouter();
    useWallet();
    const navigate = useNavigate();
    const toast = useToast();
    const [mobileOpen, setMobileOpen] = useState(false);

    const logout = async () => {
        await logoutWallet();
        setMerchant(null);
        toast.show({ title: 'Signed out', body: 'Your Payrail session has ended.' });
        navigate('/');
    };

    return (
        <div className="dash-app">
            <aside className={`dash-sidebar ${mobileOpen ? 'is-open' : ''}`}>
                <div className="dash-brand-row"><Link to="/" className="dash-brand"><RailMark size={30} /><span>Payrail</span></Link><button className="dash-close" onClick={() => setMobileOpen(false)}>×</button></div>
                <div className="dash-workspace"><span className="dash-workspace-dot" /> <span>{merchant.name || 'Merchant workspace'}</span><span className="dash-live">LIVE</span></div>
                <nav className="dash-nav" aria-label="Dashboard">
                    <span className="dash-nav-label">WORKSPACE</span>
                    {nav.map(item => (
                        <Link key={item.path} to={item.path} className={path === item.path ? 'active' : ''} onClick={() => setMobileOpen(false)}><Icon name={item.icon} />{item.label}</Link>
                    ))}
                </nav>
                <div className="dash-sidebar-bottom">
                    <div className="dash-network"><span className="lamp" data-state="caution" /><div><strong>{clusterLabel[config.cluster]}</strong><small>Solana network</small></div></div>
                    <button className="dash-side-action" onClick={logout}><LogoutIcon /> Sign out</button>
                    <Link to="/" className="dash-back-home">← Back to Payrail</Link>
                </div>
            </aside>
            {mobileOpen && <button className="dash-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
            <section id="main" className="dash-main">
                <header className="dash-topbar">
                    <button className="dash-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open dashboard navigation">☰</button>
                    <div className="dash-breadcrumb"><span>Workspace</span><b>/</b><strong>{nav.find(n => n.path === path)?.label ?? 'Overview'}</strong></div>
                    <div className="dash-top-actions">
                        <span className="dash-secure"><i /> Session secured</span>
                        <WalletButton />
                    </div>
                </header>
                <div className="dash-content">{children}</div>
            </section>
        </div>
    );
}

function Overview({ merchant }: { merchant: CurrentMerchant }) {
    const { account } = useWallet();
    const walletAddress = account?.address || merchant.walletAddress;
    const { status, refresh } = useMerchantStatus(address(walletAddress));
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
        let alive = true;
        setLoading(true);
        listPayments(undefined, 1, 20).then(r => alive && setPayments(r.payments)).catch(() => alive && setPayments([])).finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, []);

    const confirmed = payments.filter(p => p.status === 'confirmed');
    const volume = confirmed.reduce((sum, p) => sum + p.amount, 0);
    const currencyMix = confirmed.filter(p => p.currency === 'SOL').length ? 'SOL' : 'USDC';
    const active = status.state === 'ready' ? status.data.merchant?.isActive : undefined;

    return <>
        <div className="dash-page-head">
            <div><span className="eyebrow">OVERVIEW</span><h1>Good to see you, {merchant.name || 'merchant'}.</h1><p>Your payment infrastructure at a glance.</p></div>
            <Link className="btn btn-primary" to="/dashboard/payments">View payments <span>→</span></Link>
        </div>

        <div className="dash-alert-row">
            <div className={`dash-merchant-banner ${active === false ? 'inactive' : ''}`}>
                <span className="dash-banner-icon">{active === false ? '!' : '✓'}</span>
                <div><strong>Merchant {active === false ? 'inactive' : 'active'}</strong><span>{active === false ? 'Payments are currently blocked at the protocol level.' : 'Your payout wallet is registered and ready to receive.'}</span></div>
                <Link to="/dashboard/settings">Manage →</Link>
            </div>
        </div>

        <div className="dash-metrics">
            <Metric label="Payment volume" value={loading ? '—' : `${volume.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currencyMix}`} meta="Confirmed payments" icon="↗" />
            <Metric label="Payments" value={loading ? '—' : String(payments.length)} meta="All requests" icon="◌" />
            <Metric label="Successful" value={loading ? '—' : `${payments.length ? Math.round(confirmed.length / payments.length * 100) : 100}%`} meta="Confirmation rate" icon="✓" />
            <Metric label="Pending" value={loading ? '—' : String(payments.filter(p => p.status === 'pending').length)} meta="Awaiting settlement" icon="○" />
        </div>

        <div className="dash-grid-hero">
            <section className="dash-card dash-chart-card">
                <div className="dash-card-head"><div><span className="eyebrow">ACTIVITY</span><h2>Payment volume</h2></div><span className="dash-period">Last 7 days</span></div>
                {DEMO ? <DemoChart /> : <div className="dash-empty-chart"><div className="dash-empty-icon">⌁</div><strong>Volume will appear here</strong><span>Once payment activity reaches your merchant account.</span></div>}
            </section>
            <section className="dash-card dash-status-card">
                <div className="dash-card-head"><div><span className="eyebrow">ON-CHAIN</span><h2>Merchant status</h2></div><span className={`dash-status ${active ? 'dash-status-confirmed' : 'dash-status-pending'}`}><i />{active === undefined ? 'Checking' : active ? 'Active' : 'Inactive'}</span></div>
                <div className="dash-chain-row"><span>Registry</span><a href={explorerAddressUrl(config.programId)} target="_blank" rel="noreferrer" className="mono">{shortAddress(config.programId, 7, 7)} <ExternalIcon /></a></div>
                <div className="dash-chain-row"><span>Payout wallet</span><span className="mono">{shortAddress(walletAddress, 7, 7)}</span></div>
                <div className="dash-chain-row"><span>Network</span><span>{clusterLabel[config.cluster]}</span></div>
                <div className="dash-chain-foot"><Link to="/dashboard/settings">Merchant settings →</Link>{status.state === 'ready' && <button onClick={() => void refresh({ quiet: true }).catch(() => toast.show({ title: 'Refresh failed', tone: 'stop' }))}>Refresh</button>}</div>
            </section>
        </div>

        <section className="dash-card dash-table-card">
            <div className="dash-card-head"><div><span className="eyebrow">RECENT</span><h2>Recent payments</h2></div><Link to="/dashboard/payments" className="dash-card-link">View all →</Link></div>
            <PaymentTable payments={payments.slice(0, 5)} loading={loading} />
        </section>
    </>;
}

function Metric({ label, value, meta, icon }: { label: string; value: string; meta: string; icon: string }) {
    return <article className="dash-metric"><div className="dash-metric-top"><span>{label}</span><b>{icon}</b></div><strong>{value}</strong><small>{meta}</small></article>;
}

function DashboardPaymentsConnectionState() {
    return <div className="dash-table-empty dash-connection-state"><div className="dash-empty-icon">↗</div><strong>Your server owns payment creation.</strong><span>Payrail keeps API secrets off the browser. Payments created through your merchant backend are reconciled and confirmed by Payrail; this console will surface them as the session-authenticated payment feed is enabled.</span><Link to="/dashboard/developer" className="btn btn-secondary btn-sm">View integration model</Link></div>;
}

function PaymentTable({ payments, loading }: { payments: Payment[]; loading: boolean }) {
    if (loading) return <div className="dash-table-loading">Loading payment activity…</div>;
    if (!payments.length) return <div className="dash-table-empty"><div className="dash-empty-icon">↗</div><strong>No payments yet</strong><span>Create your first payment request or connect your integration to start receiving payments.</span><Link to="/dashboard/payments" className="btn btn-secondary btn-sm">Create payment</Link></div>;
    return <div className="dash-table-wrap"><table className="dash-table"><thead><tr><th>Reference</th><th>Amount</th><th>Status</th><th>Payer</th><th>Created</th></tr></thead><tbody>{payments.map(p => <tr key={p._id}><td><Link to={`/dashboard/payments/${p._id}`} className="mono">{p.reference}</Link></td><td><strong>{money(p)}</strong></td><td><StatusPill status={p.status} /></td><td className="mono">{p.payerWallet ? shortAddress(p.payerWallet) : '—'}</td><td>{formatDate(p.createdAt)}</td></tr>)}</tbody></table></div>;
}

function PaymentsPage() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [unavailable, setUnavailable] = useState(false);
    const [filter, setFilter] = useState<'all' | PaymentStatus>('all');
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [selected, setSelected] = useState<Payment | null>(null);
    const load = useCallback(async () => {
        setLoading(true);
        try { setUnavailable(false); setPayments((await listPayments(filter === 'all' ? undefined : filter, 1, 50)).payments); } catch { setPayments([]); setUnavailable(!DEMO); } finally { setLoading(false); }
    }, [filter]);
    useEffect(() => { void load(); }, [load]);

    return <>
        <div className="dash-page-head"><div><span className="eyebrow">PAYMENTS</span><h1>Payment requests</h1><p>Track requests, confirmations and on-chain settlement.</p></div>DEMO ? <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ Create payment</button> : <Link className="btn btn-secondary" to="/dashboard/developer">View API integration →</Link></div>
        <div className="dash-filter-bar"><div className="dash-segmented">{(['all', 'confirmed', 'pending', 'expired', 'failed'] as const).map(v => <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>{v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}</button>)}</div><span>{payments.length} shown</span></div>
        <section className="dash-card dash-table-card">{unavailable ? <DashboardPaymentsConnectionState /> : <PaymentTable payments={payments} loading={loading} />}</section>
        {createOpen && <CreatePaymentModal onClose={() => setCreateOpen(false)} onCreated={p => { setCreateOpen(false); setSelected(p); void load(); }} />}
        {selected && <PaymentDetails payment={selected} onClose={() => setSelected(null)} />}
    </>;
}

function CreatePaymentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (payment: Payment) => void }) {
    const [amount, setAmount] = useState('1');
    const [currency, setCurrency] = useState<'SOL' | 'USDC'>('SOL');
    const [label, setLabel] = useState('Payrail checkout');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [created, setCreated] = useState<{ payment: Payment; url: string } | null>(null);
    const toast = useToast();
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            const result = await createPayment({ amount: Number(amount), currency, label: label || undefined, message: message || undefined });
            setCreated({ payment: result.paymentRequestData, url: result.solanaPayUrl });
            onCreated(result.paymentRequestData);
        } catch (e) { toast.show({ title: 'Could not create payment', body: e instanceof Error ? e.message : 'Try again.', tone: 'stop' }); } finally { setBusy(false); }
    };
    return <div className="dash-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="dash-modal"><button className="dash-modal-close" onClick={onClose}>×</button>{created ? <div className="dash-created"><span className="eyebrow">PAYMENT READY</span><h2>Send this request to your customer.</h2><p>The customer can scan the Solana Pay QR or open the payment URL.</p><QrCode value={created.url} size={190} label="Solana Pay payment QR code"/><div className="dash-copy-field"><span>{created.payment.amount} {created.payment.currency}</span><CopyButton value={created.url} label="Copy payment URL" /></div><button className="btn btn-primary btn-block" onClick={onClose}>Done</button></div> : <form onSubmit={submit}><span className="eyebrow">NEW PAYMENT</span><h2>Create a payment request</h2><p className="dash-modal-sub">Generate a verifiable Solana Pay request for a customer.</p><label>Amount<div className="dash-input-group"><input required min="0.000001" step="any" type="number" value={amount} onChange={e => setAmount(e.target.value)} /><select value={currency} onChange={e => setCurrency(e.target.value as 'SOL' | 'USDC')}><option>SOL</option><option>USDC</option></select></div></label><label>Label<input value={label} maxLength={100} onChange={e => setLabel(e.target.value)} /></label><label>Message <span>optional</span><textarea value={message} maxLength={500} rows={3} onChange={e => setMessage(e.target.value)} /></label><div className="dash-modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create request'}</button></div></form>}</section></div>;
}

function PaymentDetails({ payment, onClose }: { payment: Payment; onClose: () => void }) {
    return <div className="dash-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="dash-modal dash-detail"><button className="dash-modal-close" onClick={onClose}>×</button><span className="eyebrow">PAYMENT DETAILS</span><h2>{money(payment)}</h2><StatusPill status={payment.status} /><div className="dash-detail-list"><Detail label="Reference" value={payment.reference} mono /><Detail label="Payer" value={payment.payerWallet ? shortAddress(payment.payerWallet, 10, 10) : 'Not detected'} mono /><Detail label="Created" value={formatDate(payment.createdAt)} /><Detail label="Confirmed" value={formatDate(payment.confirmedAt)} /><Detail label="Payment PDA" value={shortAddress(payment.onChainPda, 10, 10)} mono /></div>{payment.transactionSignature && <a className="btn btn-secondary btn-block" href={explorerTxUrl(payment.transactionSignature)} target="_blank" rel="noreferrer">View transaction on Explorer <ExternalIcon /></a>}</section></div>;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div><span>{label}</span><strong className={mono ? 'mono' : ''}>{value}</strong></div>; }

function DeveloperPage() {
    return <><div className="dash-page-head"><div><span className="eyebrow">DEVELOPER</span><h1>Build on Payrail.</h1><p>Keep secrets on your server. Let Payrail handle payment verification and webhooks.</p></div></div><div className="dash-dev-grid"><section className="dash-card dash-dev-hero"><span className="dash-dev-kicker">SERVER-SIDE BY DESIGN</span><h2>Your API secret belongs in your backend.</h2><p>Payrail's browser dashboard never stores your secret key. Use the credentials issued during merchant registration from your server environment.</p><div className="dash-code"><div><span className="code-dot"/><span className="code-dot"/><span className="code-dot"/></div><pre>{`const response = await fetch(\n  process.env.PAYRAIL_API_URL + '/payments',\n  {\n    headers: {\n      'x-api-key': process.env.PAYRAIL_API_KEY,\n      'x-api-secret': process.env.PAYRAIL_API_SECRET\n    }\n  }\n);`}</pre></div></section><section className="dash-card dash-stack"><span className="eyebrow">INTEGRATION MODEL</span><h2>Payment lifecycle</h2><FlowStep n="01" title="Create" body="Your server creates a payment request."/><FlowStep n="02" title="Pay" body="Customer pays directly to your payout wallet."/><FlowStep n="03" title="Verify" body="Payrail reconciles amount, reference and mint."/><FlowStep n="04" title="Notify" body="Your webhook receives a signed confirmation."/></section></div><section className="dash-card dash-security"><div><span className="eyebrow">NON-CUSTODIAL</span><h2>Money never passes through Payrail.</h2><p>The buyer pays the merchant directly. The on-chain receipt and verification layer gives your application a reliable payment state without custody.</p></div><Link className="btn btn-secondary" to="/#developers">Read architecture →</Link></section></>;
}
function FlowStep({ n, title, body }: { n: string; title: string; body: string }) { return <div className="dash-flow-step"><b>{n}</b><div><strong>{title}</strong><span>{body}</span></div></div>; }

function SettingsPage({ merchant }: { merchant: CurrentMerchant }) {
    const { account } = useWallet();
    const walletAddress = account?.address || merchant.walletAddress;
    const { status, refresh } = useMerchantStatus(address(walletAddress));
    const [busy, setBusy] = useState(false);
    const toast = useToast();
    const active = status.state === 'ready' ? status.data.merchant?.isActive : undefined;

    const toggle = async () => {
        if (!account || active === undefined) return;
        setBusy(true);
        try {
            await sendWalletTransaction({ account, buildInstruction: getUpdateInstructionAsync, onPhase: () => undefined });
            await refresh({ quiet: true });
            toast.show({ title: active ? 'Merchant deactivated' : 'Merchant activated', body: 'The on-chain status has been updated.', tone: 'proceed' });
        } catch (e) { toast.show({ title: 'Status update failed', body: e instanceof Error ? e.message : 'Try again.', tone: 'stop' }); } finally { setBusy(false); }
    };
    return <><div className="dash-page-head"><div><span className="eyebrow">SETTINGS</span><h1>Merchant settings</h1><p>Identity, payout destination and on-chain controls.</p></div></div><div className="dash-settings-grid"><section className="dash-card"><div className="dash-card-head"><div><span className="eyebrow">PROFILE</span><h2>Business profile</h2></div></div><div className="dash-setting-row"><span>Business name</span><strong>{merchant.name || 'Not set'}</strong></div><div className="dash-setting-row"><span>Email</span><strong>{merchant.email}</strong></div><div className="dash-setting-row"><span>Merchant ID</span><strong className="mono">{shortAddress(merchant.id, 10, 8)}</strong></div></section><section className="dash-card"><div className="dash-card-head"><div><span className="eyebrow">PAYOUT</span><h2>Wallet & status</h2></div><span className={`dash-status ${active ? 'dash-status-confirmed' : 'dash-status-pending'}`}><i />{active ? 'Active' : active === false ? 'Inactive' : 'Checking'}</span></div><div className="dash-wallet-block"><div className="dash-wallet-symbol"><WalletIcon /></div><div><strong className="mono">{shortAddress(walletAddress, 10, 10)}</strong><span>Your connected payout wallet</span></div><CopyButton value={walletAddress} label="Copy payout wallet" /></div><a className="dash-explorer-line" href={explorerAddressUrl(walletAddress)} target="_blank" rel="noreferrer">View wallet on Explorer <ExternalIcon /></a><div className="dash-setting-action"><div><strong>{active ? 'Accepting payments' : 'Payments paused'}</strong><span>Toggle merchant availability at the protocol layer.</span></div><button className="btn btn-secondary" disabled={busy || active === undefined} onClick={toggle}>{busy ? 'Confirming…' : active ? 'Deactivate' : 'Activate'}</button></div></section></div><section className="dash-card dash-danger"><div><span className="eyebrow">SESSION</span><h2>Wallet authentication</h2><p>Your dashboard session expires automatically. Signing in again requires a fresh wallet challenge.</p></div><span className="dash-session-chip">7 day session</span></section></>;
}

export function Dashboard() {
    const { path } = useRouter();
    const { account } = useWallet();
    const [merchant, setMerchant] = useState<CurrentMerchant | null>(null);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        let alive = true;
        setChecking(true);
        getCurrentMerchant().then(m => { if (!alive) return; const wallet = account?.address; setMerchant(wallet && m.walletAddress && wallet !== m.walletAddress ? null : { ...m, walletAddress: wallet || m.walletAddress }); }).catch(() => alive && setMerchant(null)).finally(() => alive && setChecking(false));
        return () => { alive = false; };
    }, [account?.address]);

    useEffect(() => {
        document.title = `Payrail · ${nav.find(n => n.path === path)?.label ?? 'Dashboard'}`;
    }, [path]);

    if (checking) return <main className="dash-auth-page"><div className="dash-loading-card"><div className="dash-spinner"/><strong>Restoring your Payrail session</strong><span>Checking your merchant workspace…</span></div></main>;
    if (!merchant) return <AuthGate onAuthenticated={setMerchant} />;

    let page: ReactNode = <Overview merchant={merchant} />;
    if (path === '/dashboard/payments') page = <PaymentsPage />;
    if (path === '/dashboard/developer') page = <DeveloperPage />;
    if (path === '/dashboard/settings') page = <SettingsPage merchant={merchant} />;
    if (path.startsWith('/dashboard/payments/')) {
        page = <PaymentRoute />;
    }
    return <DashboardShell merchant={merchant} setMerchant={setMerchant}>{page}</DashboardShell>;
}

function PaymentRoute() {
    const { path } = useRouter();
    const id = path.split('/').pop()!;
    const [payment, setPayment] = useState<Payment | null>(null);
    useEffect(() => { void getPayment(id).then(setPayment).catch(() => setPayment(null)); }, [id]);
    if (!payment) return <div className="dash-not-found"><span className="eyebrow">PAYMENT</span><h1>Payment not found</h1><p>The payment may have expired or is not available in this workspace.</p><Link className="btn btn-secondary" to="/dashboard/payments">Back to payments</Link></div>;
    return <div className="dash-detail-page"><Link className="dash-back-link" to="/dashboard/payments">← Payments</Link><div className="dash-page-head"><div><span className="eyebrow">PAYMENT DETAIL</span><h1>{money(payment)}</h1><p className="mono">{payment.reference}</p></div><StatusPill status={payment.status} /></div><section className="dash-card dash-detail-page-card"><div className="dash-detail-list"><Detail label="Reference" value={payment.reference} mono /><Detail label="Status" value={payment.status === 'confirmed' ? 'Paid' : payment.status} /><Detail label="Payer" value={payment.payerWallet ? shortAddress(payment.payerWallet, 12, 12) : 'Not detected'} mono /><Detail label="Created" value={formatDate(payment.createdAt)} /><Detail label="Confirmed" value={formatDate(payment.confirmedAt)} /><Detail label="Payment PDA" value={shortAddress(payment.onChainPda, 12, 12)} mono /></div>{payment.transactionSignature && <a className="btn btn-secondary" href={explorerTxUrl(payment.transactionSignature)} target="_blank" rel="noreferrer">View transaction on Explorer <ExternalIcon /></a>}</section></div>;
}
