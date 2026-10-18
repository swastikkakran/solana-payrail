import { useEffect, useState } from 'react';

import { clusterLabel, config } from '../config';
import { DEMO } from '../demo/mode';
import { explorerAddressUrl, shortAddress } from '../lib/format';
import { Link, useRouter } from '../lib/router';
import { WalletButton } from '../wallet/WalletButton';
import { useWallet } from '../wallet/WalletProvider';
import { CopyButton } from './CopyButton';
import { ExternalIcon, RailMark } from './Icons';

export function Brand() {
    return (
        <Link to="/" className="brand" aria-label="Payrail home">
            <RailMark />
            <span className="brand-word">Payrail</span>
        </Link>
    );
}

const NAV = [
    { to: '/#flow', label: 'How it works' },
    { to: '/#compare', label: 'Why Solana', extra: true },
    { to: '/#developers', label: 'Developers' },
    { to: '/#roadmap', label: 'Roadmap', extra: true },
    { to: '/register', label: 'Register' },
];

export function SiteHeader() {
    const { path } = useRouter();
    const { account } = useWallet();
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    useEffect(() => setMenuOpen(false), [path]);
    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menuOpen]);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header className="site-header" data-scrolled={scrolled}>
            <div className="page">
                <Brand />
                <nav className="site-nav" aria-label="Primary">
                    {NAV.map(n => (
                        <Link
                            key={n.to}
                            to={n.to}
                            className={n.extra ? 'nav-extra' : undefined}
                            aria-current={n.to === path ? 'page' : undefined}
                        >
                            {n.label}
                        </Link>
                    ))}
                </nav>
                <div className="header-actions">
                    <span
                        className="cluster-pill"
                        data-demo={DEMO}
                        title={DEMO ? 'Demo mode: simulated wallet and network' : `Connected to Solana ${clusterLabel[config.cluster]}`}
                    >
                        <span className="lamp" data-state={config.cluster === 'mainnet' && !DEMO ? 'proceed' : 'caution'} />
                        {clusterLabel[config.cluster]}
                        {DEMO && <span className="cluster-demo">Demo</span>}
                    </span>
                    {account && <Link to="/dashboard" className="header-dashboard-link">Dashboard</Link>}
                    <WalletButton />
                    <button
                        type="button"
                        className="menu-toggle"
                        aria-expanded={menuOpen}
                        aria-controls="mobile-nav"
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                        onClick={() => setMenuOpen(o => !o)}
                    >
                        <span aria-hidden data-open={menuOpen} />
                    </button>
                </div>
            </div>
            {menuOpen && (
                <nav id="mobile-nav" className="mobile-nav" aria-label="Primary">
                    <div className="page">
                        {account && <Link to="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</Link>}
                        {NAV.map(n => (
                            <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} aria-current={n.to === path ? 'page' : undefined}>
                                {n.label}
                            </Link>
                        ))}
                        <span className="mobile-nav-net">
                            <span className="lamp" data-state={config.cluster === 'mainnet' && !DEMO ? 'proceed' : 'caution'} />
                            Solana {clusterLabel[config.cluster]}
                            {DEMO ? ' · demo mode' : ''}
                        </span>
                    </div>
                </nav>
            )}
        </header>
    );
}

export function SiteFooter() {
    return (
        <footer className="site-footer">
            <div className="page">
                <Brand />
                <a href={config.repoUrl} target="_blank" rel="noreferrer">
                    Source
                </a>
                <a href={config.docsUrl} target="_blank" rel="noreferrer">
                    API reference
                </a>
                <span className="footer-program">
                    Merchant registry on {clusterLabel[config.cluster]}
                    <span className="footer-addr">
                        <a className="ext-link mono" href={explorerAddressUrl(config.programId)} target="_blank" rel="noreferrer">
                            {shortAddress(config.programId, 6, 6)} <ExternalIcon />
                        </a>
                        <CopyButton value={config.programId} label="Copy program address" />
                    </span>
                </span>
            </div>
        </footer>
    );
}
