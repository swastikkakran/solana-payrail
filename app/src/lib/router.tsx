/**
 * Minimal history router. Two routes today; swap for react-router when the dashboard,
 * payments and settings screens land (the <Link> / useNavigate surface matches).
 *
 * Set VITE_ROUTER=hash for static hosts without SPA rewrites: routes then live in the
 * fragment (`#/register`), and a fragment that isn't a route (`#custody`) is an in-page anchor
 * on the landing page.
 */
import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

const HASH_MODE = import.meta.env.VITE_ROUTER === 'hash';

interface RouterValue {
    path: string;
    navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue>({ path: '/', navigate: () => {} });

function currentPath() {
    if (!HASH_MODE) return window.location.pathname;
    const h = window.location.hash;
    return h.startsWith('#/') ? h.slice(1) : '/';
}

/** Where a `to` like "/register" or "/#custody" points in the address bar. */
export function hrefFor(to: string) {
    if (!HASH_MODE) return to;
    const url = new URL(to, window.location.origin);
    if (url.origin !== window.location.origin) return to;
    if (url.pathname === '/') return url.hash || '#/';
    return `#${url.pathname}`;
}

function scrollToHash(hash: string) {
    requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
}

export function RouterProvider({ children }: { children: ReactNode }) {
    const [path, setPath] = useState(currentPath);

    useEffect(() => {
        const sync = () => setPath(currentPath());
        window.addEventListener('popstate', sync);
        if (HASH_MODE) window.addEventListener('hashchange', sync);
        return () => {
            window.removeEventListener('popstate', sync);
            window.removeEventListener('hashchange', sync);
        };
    }, []);

    const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
        const url = new URL(to, window.location.origin);
        const next = HASH_MODE
            ? `${window.location.pathname}${window.location.search}${hrefFor(to)}`
            : `${url.pathname}${url.search}${url.hash}`;
        if (opts?.replace) window.history.replaceState(null, '', next);
        else window.history.pushState(null, '', next);
        setPath(url.pathname);
        if (url.hash) scrollToHash(url.hash);
        else window.scrollTo({ top: 0 });
    }, []);

    return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter() {
    return useContext(RouterContext);
}

export function useNavigate() {
    return useContext(RouterContext).navigate;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

export function Link({ to, onClick, ...rest }: LinkProps) {
    const { navigate, path } = useContext(RouterContext);
    return (
        <a
            href={hrefFor(to)}
            onClick={e => {
                onClick?.(e);
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                const url = new URL(to, window.location.origin);
                // In-page anchors on the current route: let the browser scroll.
                if (!HASH_MODE && url.pathname === path && url.hash) return;
                e.preventDefault();
                if (url.pathname === path && url.hash) {
                    scrollToHash(url.hash);
                    if (HASH_MODE) window.history.replaceState(null, '', hrefFor(to));
                    return;
                }
                navigate(to);
            }}
            {...rest}
        />
    );
}
