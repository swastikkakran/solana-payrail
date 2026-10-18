import { ExternalIcon } from '../../components/Icons';
import { clusterLabel, config } from '../../config';
import type { FriendlyError } from '../../lib/errors';
import { explorerTxUrl } from '../../lib/format';

const FAUCET_URL = 'https://faucet.solana.com';

export function ErrorPanel({
    error,
    onRetry,
    retryLabel = 'Try again',
    onDismiss,
    compact,
}: {
    error: FriendlyError;
    onRetry?: () => void;
    retryLabel?: string;
    onDismiss?: () => void;
    compact?: boolean;
}) {
    const showFaucet = error.action === 'faucet' && config.cluster !== 'mainnet';
    return (
        <div className="err-panel" role="alert" data-compact={compact}>
            <span className="lamp" data-state="stop" />
            <div className="err-panel-body">
                <strong>{error.title}</strong>
                <p>{error.body}</p>
                {(onRetry || showFaucet || error.signature || onDismiss) && (
                    <div className="err-actions">
                        {onRetry && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
                                {retryLabel}
                            </button>
                        )}
                        {showFaucet && (
                            <a className="btn btn-secondary btn-sm" href={FAUCET_URL} target="_blank" rel="noreferrer">
                                Get {clusterLabel[config.cluster]} SOL <ExternalIcon />
                            </a>
                        )}
                        {error.signature && (
                            <a className="ext-link" href={explorerTxUrl(error.signature)} target="_blank" rel="noreferrer">
                                View transaction <ExternalIcon />
                            </a>
                        )}
                        {onDismiss && (
                            <button type="button" className="btn btn-quiet btn-sm" onClick={onDismiss}>
                                Back
                            </button>
                        )}
                    </div>
                )}
                {error.logs && error.logs.length > 0 && (
                    <details className="err-logs">
                        <summary>Program logs</summary>
                        <pre className="mono">{error.logs.join('\n')}</pre>
                    </details>
                )}
            </div>
        </div>
    );
}
