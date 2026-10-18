import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/base.css';
import './styles/components.css';
import './styles/landing.css';
import './styles/register.css';
import './styles/dashboard.css';

import { App } from './App';
import { DEMO } from './demo/mode';
import { registerDemoWallet } from './demo/wallet';
import { ToastProvider } from './components/Toasts';
import { RouterProvider } from './lib/router';
import { WalletProvider } from './wallet/WalletProvider';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

if (DEMO) registerDemoWallet();

createRoot(root).render(
    <StrictMode>
        <ToastProvider>
            <WalletProvider>
                <RouterProvider>
                    <App />
                </RouterProvider>
            </WalletProvider>
        </ToastProvider>
    </StrictMode>,
);
