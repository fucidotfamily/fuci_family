import { isHex } from "viem";
import { ARC_CHAIN } from "./config";
import { readClient } from "./chain";
import { ownerMessage } from "./ownerMessage";
import { resolveAgent, type AgentCard } from "./store";

export type OwnerProof = { address?: string; issuedAt?: number; signature?: string };

/**
 * Check that a request comes from the agent's owner: a fresh signature of `ownerMessage`
 * by the owner's wallet. viem's verifyMessage covers plain wallets and smart accounts
 * (ERC-1271 / ERC-6492), so Circle passkey wallets work too.
 */
export async function verifyOwner(
  agentId: string,
  action: Parameters<typeof ownerMessage>[0]["action"],
  proof: OwnerProof,
  detail?: string,
  /** How long a signature stays valid (default 10 minutes). */
  maxAgeMs = 10 * 60_000,
): Promise<AgentCard> {
  const { agent } = await resolveAgent(agentId);
  if (!agent) throw new OwnerError("Agent not found", 404);
  const { address, issuedAt, signature } = proof;
  if (!address || address.toLowerCase() !== agent.owner.toLowerCase()) throw new OwnerError("Only this agent's owner can do that. Connect the wallet that spawned it.", 403);
  if (typeof issuedAt !== "number" || Math.abs(Date.now() - issuedAt) > maxAgeMs) throw new OwnerError("The signature expired. Please sign again.", 401);
  if (!signature || !isHex(signature)) throw new OwnerError("Missing signature", 401);
  const message = ownerMessage({ action, agent: agent.id, detail, issuedAt });
  const ok = await readClient(ARC_CHAIN)
    .verifyMessage({ address: agent.owner as `0x${string}`, message, signature })
    .catch(() => false);
  if (!ok) throw new OwnerError("The wallet signature did not verify. Please sign again.", 401);
  return agent;
}

export class OwnerError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
