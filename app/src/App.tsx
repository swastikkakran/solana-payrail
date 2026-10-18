import { useEffect } from 'react';

import { SiteFooter, SiteHeader } from './components/SiteChrome';
import { DemoBanner, DemoExplorerGuard, DemoWalletPrompt } from './demo/DemoUi';
import { DEMO } from './demo/mode';
import { useRouter } from './lib/router';
import { Landing } from './pages/landing/Landing';
import { Register } from './pages/register/Register';
import { ConnectWalletDialog } from './wallet/ConnectWalletDialog';

const TITLES: Record<string, string> = {
    '/': 'Payrail · Non-custodial payments on Solana',
    '/register': 'Register your wallet · Payrail',
};

export function App() {
    const { path } = useRouter();
    const route = path === '/register' ? '/register' : '/';

    useEffect(() => {
        document.title = TITLES[route] ?? TITLES['/']!;
    }, [route]);

    return (
        <>
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            {DEMO && <DemoBanner />}
            <SiteHeader />
            {route === '/register' ? <Register /> : <Landing />}
            <SiteFooter />
            <ConnectWalletDialog />
            {DEMO && (
                <>
                    <DemoWalletPrompt />
                    <DemoExplorerGuard />
                </>
            )}
        </>
    );
}
