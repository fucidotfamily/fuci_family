import { NextResponse, type NextRequest } from "next/server";
import type { Address } from "viem";
import { readClient } from "@/lib/chain";
import { ARC_CHAIN } from "@/lib/config";
import { ERC8004, IDENTITY_ABI } from "@/lib/erc8004Abi";
import { agentAccount } from "@/lib/agentWallets";
import { allow, kvGet, kvSet, resolveAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";

async function load(id: string) {
  const { agent: a } = await resolveAgent(id);
  if (!a) return { error: "Agent not found", status: 404 } as const;
  if (a.erc8004Id === undefined) return { error: "This agent isn't on-chain yet", status: 400 } as const;
  if (!a.wallet) return { error: "This agent has no wallet yet", status: 400 } as const;
  const c = readClient(ARC_CHAIN);
  const agentId = BigInt(a.erc8004Id);
  const [owner, linked, uri] = await Promise.all([
    c.readContract({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "ownerOf", args: [agentId] }),
    c.readContract({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "getAgentWallet", args: [agentId] }).catch(() => ZERO as Address),
    c.readContract({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "tokenURI", args: [agentId] }),
  ]);
  return { a, agentId, owner, linked, uri, wallet: a.wallet as Address };
}

/** Whether the agent's own wallet is set as its ERC-8004 agentWallet, plus its current agentURI. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id).catch((e: Error) => ({ error: e.message, status: 502 }) as const);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const linked = r.linked.toLowerCase() === r.wallet.toLowerCase();
  // Just linked: drop Know Your Agent's cached wallet map and report once, so it shows the identity right away.
  if (linked && !(await kvGet<boolean>(`agent-wallet:kya-fresh:${r.wallet.toLowerCase()}`).catch(() => true))) {
    await Promise.all([kvSet("kya:v1:wallets", null, 1), kvSet(`kya:v1:${r.wallet.toLowerCase()}`, null, 1), kvSet(`agent-wallet:kya-fresh:${r.wallet.toLowerCase()}`, true)]).catch(() => undefined);
  }
  return NextResponse.json({ agentId: r.agentId.toString(), uri: r.uri, wallet: r.wallet, linked: r.linked.toLowerCase() === r.wallet.toLowerCase(), current: r.linked === ZERO ? null : r.linked });
}

/**
 * The agent wallet's EIP-712 consent to be this agent's agentWallet (ERC-8004 setAgentWallet).
 * It only says "this wallet agrees to belong to agent N owned by X" for a few minutes; the owner
 * still has to send the transaction from their own wallet, so handing it out is safe.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`agent-wallet-sig:${ip}`, 10, 3600))) return NextResponse.json({ error: "Too many requests, try again later" }, { status: 429 });
  const r = await load(id).catch((e: Error) => ({ error: e.message, status: 502 }) as const);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const account = await agentAccount(r.a.id);
  if (account.address.toLowerCase() !== r.wallet.toLowerCase()) return NextResponse.json({ error: "Agent wallet mismatch" }, { status: 500 });
  // The registry accepts deadlines at most 5 minutes ahead.
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 240);
  const signature = await account.signTypedData({
    domain: { name: "ERC8004IdentityRegistry", version: "1", chainId: ARC_CHAIN.id, verifyingContract: ERC8004.identity },
    types: { AgentWalletSet: [{ name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" }, { name: "owner", type: "address" }, { name: "deadline", type: "uint256" }] },
    primaryType: "AgentWalletSet",
    message: { agentId: r.agentId, newWallet: account.address, owner: r.owner, deadline },
  });
  return NextResponse.json({ agentId: r.agentId.toString(), wallet: account.address, owner: r.owner, deadline: deadline.toString(), signature });
}
