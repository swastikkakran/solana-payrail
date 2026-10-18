import { createSolanaRpc, createSolanaRpcFromTransport } from '@solana/kit';

import { config } from '../config';
import { demoTransport } from '../demo/chain';
import { DEMO } from '../demo/mode';

type Transport = Parameters<typeof createSolanaRpcFromTransport>[0];

/**
 * HTTP RPC only: confirmation is polled, so the app never needs a websocket to the cluster.
 * In demo mode the same RPC client talks to a simulated network in the page instead.
 */
export const rpc = DEMO
    ? (createSolanaRpcFromTransport(demoTransport as unknown as Transport) as unknown as ReturnType<typeof createSolanaRpc>)
    : createSolanaRpc(config.rpcUrl);
