import type { ReactNode } from 'react';

import { CheckIcon } from '../../components/Icons';

export type StepStatus = 'todo' | 'active' | 'done' | 'failed';

export interface ProgressStep {
    id: string;
    title: string;
    detail: ReactNode;
    status: StepStatus;
}

/** Vertical rail: one station per step, the track fills in as each one completes. */
export function ProgressLog({ steps, label }: { steps: ProgressStep[]; label: string }) {
    return (
        <ol className="progress" aria-label={label}>
            {steps.map(s => (
                <li key={s.id} className="progress-step" data-status={s.status} aria-current={s.status === 'active' ? 'step' : undefined}>
                    <span className="progress-marker" aria-hidden>
                        {s.status === 'done' ? <CheckIcon width={12} height={12} /> : s.status === 'active' ? <span className="spinner" /> : null}
                    </span>
                    <div className="progress-text">
                        <span className="progress-title">{s.title}</span>
                        <span className="progress-detail">{s.detail}</span>
                    </div>
                    <span className="visually-hidden">
                        {s.status === 'done' ? 'Done' : s.status === 'active' ? 'In progress' : s.status === 'failed' ? 'Failed' : 'Not started'}
                    </span>
                </li>
            ))}
        </ol>
    );
}
