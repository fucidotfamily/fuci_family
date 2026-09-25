import { createPublicClient, createWalletClient, fallback, http, type Chain, type PublicClient } from "viem";
import { arc } from "viem/chains";
import type { PrivateKeyAccount } from "viem/accounts";

/**
 * Arc RPC clients. Public Arc RPCs rate-limit bursts, so every client rotates
 * across all of a chain's endpoints (a private ARC_RPC_URL / ARGUS_RPC_URL goes first on mainnet).
 */
const urlsFor = (chain: Chain) =>
  [...(chain.id === arc.id ? [process.env.ARC_RPC_URL, process.env.ARGUS_RPC_URL, process.env.FOCI_RPC_URL] : []), ...chain.rpcUrls.default.http].filter(Boolean) as string[];

const transportFor = (chain: Chain) =>
  fallback(
    urlsFor(chain).map((u) => http(u, { timeout: 10_000, retryCount: 2, retryDelay: 350 })),
    { retryCount: 1 },
  );

const readers = new Map<number, PublicClient>();
export function readClient(chain: Chain): PublicClient {
  let c = readers.get(chain.id);
  if (!c) {
    c = createPublicClient({ chain, transport: transportFor(chain) }) as PublicClient;
    readers.set(chain.id, c);
  }
  return c;
}

export const walletClientFor = (chain: Chain, account: PrivateKeyAccount) => createWalletClient({ chain, account, transport: transportFor(chain) });
