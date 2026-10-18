/** Bridge between the demo wallet (plain JS) and its approval popup (React). */
export type ApprovalRequest =
    | { kind: 'connect'; resolve: (ok: boolean) => void }
    | {
          kind: 'sign';
          instruction: 'initialize' | 'update' | 'unknown';
          program: string;
          accounts: string[];
          resolve: (ok: boolean) => void;
      };

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

export function requestApproval(req: Omit<ApprovalRequest, 'resolve'>): Promise<boolean> {
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
