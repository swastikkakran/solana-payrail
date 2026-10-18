export type ApprovalRequest =
    | { kind: 'connect'; resolve: (ok: boolean) => void }
    | { kind: 'message'; message: string; resolve: (ok: boolean) => void }
    | {
          kind: 'sign';
          instruction: 'initialize' | 'update' | 'unknown';
          program: string;
          accounts: string[];
          resolve: (ok: boolean) => void;
      };

type ApprovalInput = {
    [K in ApprovalRequest['kind']]: Omit<
        Extract<ApprovalRequest, { kind: K }>,
        'resolve'
    >
}[ApprovalRequest['kind']];

type Listener = (r: ApprovalRequest | null) => void;

const listeners = new Set<Listener>();
let current: ApprovalRequest | null = null;

export function subscribe(l: Listener) {
    listeners.add(l);
    l(current);
    return () => {
        listeners.delete(l);
    };
}

function emit() {
    for (const l of listeners) l(current);
}

export function requestApproval(req: ApprovalInput): Promise<boolean> {
    return new Promise(resolve => {
        current?.resolve(false);

        current = {
            ...req,
            resolve: ok => {
                current = null;
                emit();
                resolve(ok);
            },
        } as ApprovalRequest;

        emit();
    });
}