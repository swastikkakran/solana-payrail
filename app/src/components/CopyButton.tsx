import { useEffect, useState } from 'react';

import { CheckIcon, CopyIcon } from './Icons';

export async function copyText(value: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        // Fallback for contexts without the async clipboard API.
        try {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch {
            return false;
        }
    }
}

export function CopyButton({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const t = setTimeout(() => setCopied(false), 1600);
        return () => clearTimeout(t);
    }, [copied]);
    return (
        <button
            type="button"
            className="copy-btn"
            data-copied={copied}
            aria-label={copied ? 'Copied' : label}
            title={copied ? 'Copied' : label}
            onClick={async () => setCopied(await copyText(value))}
        >
            {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
    );
}
