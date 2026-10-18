import { useMemo } from 'react';

import qrcodegen from '../lib/vendor/qrcodegen';

/** A real, scannable QR code drawn as one SVG path. */
export function QrCode({ value, size = 160, label }: { value: string; size?: number; label: string }) {
    const { path, n } = useMemo(() => {
        const qr = qrcodegen.QrCode.encodeText(value, qrcodegen.QrCode.Ecc.MEDIUM);
        let d = '';
        for (let y = 0; y < qr.size; y++) {
            for (let x = 0; x < qr.size; x++) {
                if (qr.getModule(x, y)) d += `M${x + 4},${y + 4}h1v1h-1z`;
            }
        }
        return { path: d, n: qr.size + 8 };
    }, [value]);

    return (
        <svg className="qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="crispEdges">
            <rect width={n} height={n} fill="#fff" />
            <path d={path} fill="#131a21" />
        </svg>
    );
}
