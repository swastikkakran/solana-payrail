import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
};

/** Track seen from above: two rails, three ties. */
export function RailMark({ size = 24, ...p }: P & { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
            <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6.25" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
            <path d="M7.5 5v14M12 5v14M16.5 5v14" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.6" />
            <path d="M4.5 9.25h15M4.5 14.75h15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

export function CopyIcon(p: P) {
    return (
        <svg {...base} {...p}>
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" />
        </svg>
    );
}

export function CheckIcon(p: P) {
    return (
        <svg {...base} {...p}>
            <path d="m3.5 8.5 3 3 6-7" />
        </svg>
    );
}

export function ExternalIcon(p: P) {
    return (
        <svg {...base} width={13} height={13} {...p}>
            <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V4.5A.5.5 0 0 1 3 4h3.5" />
        </svg>
    );
}

export function CloseIcon(p: P) {
    return (
        <svg {...base} {...p}>
            <path d="m4 4 8 8M12 4l-8 8" />
        </svg>
    );
}

export function CaretIcon(p: P) {
    return (
        <svg {...base} width={12} height={12} {...p}>
            <path d="m4 6 4 4 4-4" />
        </svg>
    );
}

export function KeyOffIcon(p: P) {
    return (
        <svg {...base} {...p}>
            <circle cx="5.5" cy="10.5" r="3" />
            <path d="m7.7 8.3 5.8-5.8M11 5l1.5 1.5M2 2l12 12" />
        </svg>
    );
}

export function EyeIcon(p: P) {
    return (
        <svg {...base} {...p}>
            <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
            <circle cx="8" cy="8" r="2" />
        </svg>
    );
}

export function EyeOffIcon(p: P) {
    return (
        <svg {...base} {...p}>
            <path d="M6.3 3.7A6.6 6.6 0 0 1 8 3.5c4.1 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.7 2.2M4.2 4.9C2.5 6.1 1.5 8 1.5 8s2.4 4.5 6.5 4.5c1 0 1.9-.3 2.7-.7M2 2l12 12" />
        </svg>
    );
}

export function DownloadIcon(p: P) {
    return (
        <svg {...base} {...p}>
            <path d="M8 2v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />
        </svg>
    );
}

export function WalletIcon(p: P) {
    return (
        <svg {...base} {...p}>
            <path d="M12.5 5V3.5a1 1 0 0 0-1-1h-8A1.5 1.5 0 0 0 2 4v8a1.5 1.5 0 0 0 1.5 1.5h9a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H3.5A1.5 1.5 0 0 1 2 3.5" />
            <circle cx="10.5" cy="9.25" r=".75" fill="currentColor" />
        </svg>
    );
}

export function LogoutIcon(p: P) {
    return (
        <svg {...base} {...p}>
            <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10.5 11 13.5 8l-3-3M13.5 8H6" />
        </svg>
    );
}
