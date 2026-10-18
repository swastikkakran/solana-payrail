import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Tone = 'proceed' | 'caution' | 'stop' | 'idle';

interface Toast {
    id: number;
    title: string;
    body?: string;
    tone: Tone;
}

interface ToastApi {
    show: (t: { title: string; body?: string; tone?: Tone; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextId = useRef(1);

    const show = useCallback<ToastApi['show']>(({ title, body, tone = 'caution', durationMs = 5000 }) => {
        const id = nextId.current++;
        setToasts(ts => [...ts.slice(-2), { id, title, body, tone }]);
        window.setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), durationMs);
    }, []);

    const api = useMemo(() => ({ show }), [show]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="toasts" role="status" aria-live="polite">
                {toasts.map(t => (
                    <div className="toast" key={t.id}>
                        <span className="lamp" data-state={t.tone} />
                        <div>
                            <strong>{t.title}</strong>
                            {t.body && <p>{t.body}</p>}
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
