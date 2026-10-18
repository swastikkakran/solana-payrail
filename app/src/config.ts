import { address, type Address } from '@solana/kit';

export type Cluster = 'devnet' | 'testnet' | 'mainnet';

const env = import.meta.env;

function readCluster(value: string | undefined): Cluster {
    if (value === 'mainnet' || value === 'testnet' || value === 'devnet') return value;
    return 'devnet';
}

const cluster = readCluster(env.VITE_SOLANA_CLUSTER);

const DEFAULT_RPC: Record<Cluster, string> = {
    devnet: 'https://api.devnet.solana.com',
    testnet: 'https://api.testnet.solana.com',
    mainnet: 'https://api.mainnet-beta.solana.com',
};

export const config = {
    cluster,
    /** Wallet Standard chain identifier passed to the wallet when it signs. */
    chain: `solana:${cluster}` as const,
    rpcUrl: env.VITE_SOLANA_RPC_URL || DEFAULT_RPC[cluster],
    apiUrl: (env.VITE_PAYRAIL_API_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, ''),
    /** merchant_registry program, see Anchor.toml on the migration/v3 branch. */
    programId: address(
        env.VITE_MERCHANT_REGISTRY_PROGRAM_ID || '8v5vhk23UWumv3ReypP8hetreRsLFMcACDhrn2mZb38b',
    ) as Address,
    docsUrl: env.VITE_DOCS_URL || 'https://github.com/swastikkakran/solana-payrail#api-reference',
    repoUrl: 'https://github.com/swastikkakran/solana-payrail',
} as const;

export const clusterLabel: Record<Cluster, string> = {
    devnet: 'Devnet',
    testnet: 'Testnet',
    mainnet: 'Mainnet',
};
