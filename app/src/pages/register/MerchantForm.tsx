import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { CopyButton } from '../../components/CopyButton';
import { ExternalIcon } from '../../components/Icons';
import { explorerAddressUrl } from '../../lib/format';
import type { FriendlyError } from '../../lib/errors';
import { ErrorPanel } from './ErrorPanel';

export interface MerchantDetails {
    name: string;
    email: string;
    webhookUrl: string;
}

export const EMPTY_DETAILS: MerchantDetails = { name: '', email: '', webhookUrl: '' };

type Field = keyof MerchantDetails;
export type FieldErrors = Partial<Record<Field, string>>;

/** Mirrors the backend's zod schema (src/validators/auth.validator.ts) so most mistakes never leave the browser. */
export function validateDetails(v: MerchantDetails): FieldErrors {
    const errors: FieldErrors = {};
    const email = v.email.trim();
    if (!email) errors.email = 'Enter the email for account notices.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'That doesn’t look like an email address.';

    const url = v.webhookUrl.trim();
    if (!url) errors.webhookUrl = 'Enter the URL that should receive payment webhooks.';
    else {
        let parsed: URL | null = null;
        try {
            parsed = new URL(url);
        } catch {
            parsed = null;
        }
        if (!parsed || !parsed.hostname.includes('.')) errors.webhookUrl = 'Enter a full URL, like https://example.com/webhooks/payrail.';
        else if (parsed.protocol !== 'https:') errors.webhookUrl = 'Webhooks are only delivered over HTTPS.';
    }

    if (v.name.trim().length > 80) errors.name = 'Keep the business name under 80 characters.';
    return errors;
}

interface FieldProps {
    id: string;
    label: string;
    optional?: boolean;
    hint: ReactNode;
    error?: string;
    children: (describedBy: string) => ReactNode;
}

function FormField({ id, label, optional, hint, error, children }: FieldProps) {
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    return (
        <div className="field" data-invalid={!!error}>
            <label htmlFor={id} className="field-label">
                {label}
                {optional && <span className="field-optional">Optional</span>}
            </label>
            {children(error ? `${errorId} ${hintId}` : hintId)}
            {error && (
                <p className="field-error" id={errorId}>
                    {error}
                </p>
            )}
            <p className="field-hint" id={hintId}>
                {hint}
            </p>
        </div>
    );
}

export interface MerchantFormProps {
    wallet: string;
    walletName?: string;
    walletIcon?: string;
    values: MerchantDetails;
    onChange: (v: MerchantDetails) => void;
    onSubmit: () => void;
    /** `full` signs the on-chain registration first; `details-only` just saves to Payrail. */
    mode: 'full' | 'details-only';
    serverErrors?: FieldErrors;
    banner?: FriendlyError | null;
    notice?: ReactNode;
}

export function MerchantForm({
    wallet,
    walletName,
    walletIcon,
    values,
    onChange,
    onSubmit,
    mode,
    serverErrors,
    banner,
    notice,
}: MerchantFormProps) {
    const uid = useId();
    const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
    const [submitted, setSubmitted] = useState(false);

    const clientErrors = validateDetails(values);
    const errorFor = (f: Field) => {
        if (serverErrors?.[f]) return serverErrors[f];
        return submitted || touched[f] ? clientErrors[f] : undefined;
    };

    const set = (f: Field) => (e: { target: { value: string } }) => onChange({ ...values, [f]: e.target.value });
    const blur = (f: Field) => () => setTouched(t => ({ ...t, [f]: true }));

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
        const errs = validateDetails(values);
        const first = (Object.keys(errs) as Field[])[0];
        if (first) {
            document.getElementById(`${uid}-${first}`)?.focus();
            return;
        }
        onSubmit();
    };

    return (
        <form className="reg-form" onSubmit={handleSubmit} noValidate>
            {banner && <ErrorPanel error={banner} compact />}

            <div className="payout-plate">
                <div className="payout-plate-head">
                    <span className="payout-plate-label">Payout wallet</span>
                    <span className="payout-plate-tag">Receives every payment</span>
                </div>
                <div className="payout-plate-body">
                    {walletIcon ? <img src={walletIcon} alt="" /> : <span className="payout-plate-icon" aria-hidden />}
                    <span className="mono payout-address" aria-label="Connected wallet address">
                        {wallet}
                    </span>
                    <span className="payout-actions">
                        <CopyButton value={wallet} label="Copy wallet address" />
                        <a
                            className="copy-btn"
                            href={explorerAddressUrl(wallet)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="View wallet on Solana Explorer"
                            title="View on Solana Explorer"
                        >
                            <ExternalIcon />
                        </a>
                    </span>
                </div>
                <p className="payout-plate-foot">
                    {walletName ? `Connected with ${walletName}. ` : ''}
                    To be paid somewhere else, connect that wallet instead.
                </p>
            </div>

            <fieldset className="reg-fields">
                <legend className="visually-hidden">Merchant details</legend>

                <FormField
                    id={`${uid}-name`}
                    label="Business name"
                    optional
                    hint="How your business is identified in Payrail."
                    error={errorFor('name')}
                >
                    {d => (
                        <input
                            id={`${uid}-name`}
                            className="input"
                            type="text"
                            autoComplete="organization"
                            placeholder="Acme Coffee Roasters"
                            value={values.name}
                            onChange={set('name')}
                            onBlur={blur('name')}
                            aria-describedby={d}
                            aria-invalid={!!errorFor('name')}
                        />
                    )}
                </FormField>

                <FormField
                    id={`${uid}-email`}
                    label="Email"
                    hint="For account notices. Each email can register one merchant."
                    error={errorFor('email')}
                >
                    {d => (
                        <input
                            id={`${uid}-email`}
                            className="input"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            spellCheck={false}
                            placeholder="payments@acme.com"
                            value={values.email}
                            onChange={set('email')}
                            onBlur={blur('email')}
                            aria-describedby={d}
                            aria-invalid={!!errorFor('email')}
                            required
                        />
                    )}
                </FormField>

                <FormField
                    id={`${uid}-webhookUrl`}
                    label="Webhook URL"
                    hint={
                        <>
                            Payrail sends <span className="mono">payment.confirmed</span> here, signed with your
                            webhook secret. HTTPS only.
                        </>
                    }
                    error={errorFor('webhookUrl')}
                >
                    {d => (
                        <input
                            id={`${uid}-webhookUrl`}
                            className="input input-mono"
                            type="url"
                            inputMode="url"
                            autoComplete="url"
                            spellCheck={false}
                            placeholder="https://acme.com/webhooks/payrail"
                            value={values.webhookUrl}
                            onChange={set('webhookUrl')}
                            onBlur={blur('webhookUrl')}
                            aria-describedby={d}
                            aria-invalid={!!errorFor('webhookUrl')}
                            required
                        />
                    )}
                </FormField>
            </fieldset>

            {notice}

            <div className="reg-submit">
                <p>
                    {mode === 'full' ? (
                        <>
                            Your wallet will ask you to approve <strong>one transaction</strong>. Your details are saved
                            to Payrail after it confirms.
                        </>
                    ) : (
                        <>Your merchant account is already on Solana. This only saves your details and issues API keys.</>
                    )}
                </p>
                <button type="submit" className="btn btn-primary btn-lg">
                    {mode === 'full' ? 'Register merchant' : 'Save details and get API keys'}
                </button>
            </div>
        </form>
    );
}
