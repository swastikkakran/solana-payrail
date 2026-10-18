/**
 * "Live on Devnet": real reads from the configured cluster, refreshed while the page is visible.
 * Nothing here is invented. If the cluster can't be reached the strip doesn't render, and in demo
 * mode it stays hidden because the network is simulated.
 */
import { useEffect, useState } from 'react';

import { ExternalIcon } from '../../components/Icons';
import { clusterLabel, config } from '../../config';
import { DEMO } from '../../demo/mode';
import { explorerAddressUrl, shortAddress } from '../../lib/format';
import { fetchRegistryStats, pingSlot, type RegistryStats } from '../../solana/registryStats';

const SLOT_POLL_MS = 2500;
const STATS_POLL_MS = 30_000;

export function LiveDevnet() {
    const [stats, setStats] = useState<RegistryStats | null>(null);
    const [slot, setSlot] = useState<{ slot: bigint; ms: number } | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (DEMO) return;
        let alive = true;
        let misses = 0;

        const tickSlot = async () => {
            if (document.hidden) return;
            try {
                const s = await pingSlot();
                misses = 0;
                if (alive) setSlot(s);
            } catch {
                misses++;
                if (alive && misses >= 3) setFailed(true);
            }
        };
        const loadStats = async () => {
            if (document.hidden) return;
            try {
                const s = await fetchRegistryStats();
                if (alive) setStats(s);
            } catch {
                /* keep the last good numbers */
            }
        };

        void tickSlot();
        void loadStats();
        const a = window.setInterval(tickSlot, SLOT_POLL_MS);
        const b = window.setInterval(loadStats, STATS_POLL_MS);
        return () => {
            alive = false;
            window.clearInterval(a);
            window.clearInterval(b);
        };
    }, []);

    if (DEMO || failed || (!stats && !slot)) return null;

    const cluster = clusterLabel[config.cluster];
    const programLabel = !stats ? 'Checking…' : stats.deployed && stats.executable ? 'Deployed' : 'Not found';

    return (
        <section className="live page" aria-label={`Live data from Solana ${cluster}`}>
            <div className="live-strip">
                <span className="live-head">
                    <span className="lamp" data-state="proceed" data-pulse="true" />
                    Live on Solana {cluster}
                </span>
                <dl>
                    <div>
                        <dt>Merchant registry</dt>
                        <dd>
                            <a className="mono" href={explorerAddressUrl(config.programId)} target="_blank" rel="noreferrer">
                                {shortAddress(config.programId, 4, 4)} <ExternalIcon />
                            </a>
                            <span className="live-sub">{programLabel}</span>
                        </dd>
                    </div>
                    {stats?.merchants != null && (
                        <div>
                            <dt>Merchants registered</dt>
                            <dd>
                                <span className="live-num num">{stats.merchants.toLocaleString()}</span>
                                {stats.active != null && <span className="live-sub">{stats.active.toLocaleString()} active</span>}
                            </dd>
                        </div>
                    )}
                    {slot && (
                        <div>
                            <dt>Current slot</dt>
                            <dd>
                                <span className="live-num num mono" key={String(slot.slot)}>
                                    {slot.slot.toLocaleString()}
                                </span>
                                <span className="live-sub">RPC {slot.ms} ms</span>
                            </dd>
                        </div>
                    )}
                </dl>
            </div>
        </section>
    );
}
