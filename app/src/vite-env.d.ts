/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PAYRAIL_API_URL?: string;
    readonly VITE_SOLANA_CLUSTER?: string;
    readonly VITE_SOLANA_RPC_URL?: string;
    readonly VITE_MERCHANT_REGISTRY_PROGRAM_ID?: string;
    readonly VITE_DOCS_URL?: string;
    /** `hash` for static hosts without SPA rewrites. */
    readonly VITE_ROUTER?: string;
    /** `always` locks the build into demo mode (hosted preview). */
    readonly VITE_DEMO?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
