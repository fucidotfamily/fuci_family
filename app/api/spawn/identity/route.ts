import { NextResponse, after, type NextRequest } from "next/server";
import { ARC_CHAIN } from "@/lib/config";
import { readClient } from "@/lib/chain";
import { mintedAgentId, readAgent } from "@/lib/erc8004";
import { factoryAddress } from "@/lib/factory";
import { FACTORY_ABI } from "@/lib/factoryArtifact";
import { parseEventLogs } from "viem";
import { allow, pushHistory, resolveAgent, saveAgent } from "@/lib/store";
import { explorerTx } from "@/lib/config";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * Link a spawned frond to the ERC-8004 identity its owner just minted.
 * The server checks the receipt: a mint from the identity registry to the frond's
 * owner, whose tokenURI is this frond's registration file.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`identity:${ip}`, 10, 600))) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; txHash?: string };
  if (!b.id || !b.txHash || !/^0x[0-9a-fA-F]{64}$/.test(b.txHash)) return NextResponse.json({ error: "id and txHash are required" }, { status: 400 });
  const { agent: card } = await resolveAgent(b.id);
  if (!card) return NextResponse.json({ error: "Frond not found" }, { status: 404 });
  if (card.erc8004Id !== undefined) return NextResponse.json(card);
  try {
    const receipt = await readClient(ARC_CHAIN).waitForTransactionReceipt({ hash: b.txHash as `0x${string}`, timeout: 30_000 });
    // With a factory deployed, agents are created through it (1 USDC fee); otherwise a direct registry mint.
    const factory = await factoryAddress();
    let agentId: number | null = null;
    let feePaid = 0;
    if (factory) {
      const [ev] = parseEventLogs({ abi: FACTORY_ABI, eventName: "AgentCreated", logs: receipt.logs }).filter(
        (l) => l.address.toLowerCase() === factory.toLowerCase() && l.args.owner.toLowerCase() === card.owner.toLowerCase(),
      );
      agentId = ev ? Number(ev.args.agentId) : null;
      feePaid = ev ? Number(ev.args.feePaid) / 1e6 : 0;
      if (agentId === null) return NextResponse.json({ error: "That transaction did not create this agent through the Fuci factory" }, { status: 400 });
    } else {
      agentId = mintedAgentId(receipt, card.owner as `0x${string}`);
      if (agentId === null) return NextResponse.json({ error: "That transaction did not mint an ERC-8004 identity to this frond's owner" }, { status: 400 });
    }
    const onchain = await readAgent(agentId);
    if (!onchain.uri.endsWith(`/api/agent/${card.id}/card`)) return NextResponse.json({ error: "The identity's URI does not point at this frond's card" }, { status: 400 });
    card.erc8004Id = agentId;
    if (factory) card.createdVia = "factory";
    await saveAgent(card);
    await pushHistory(card.id, { kind: "identity", label: factory ? `Created on-chain as agent #${agentId} (${feePaid} USDC fee)` : `Registered on ERC-8004 as agent #${agentId}`, href: explorerTx(b.txHash) });
    // Refresh the directory so the frond shows its full 8/8 card right away.
    after(async () => {
      const { forgetCard, rebuildIndex } = await import("@/lib/agentIndex");
      await forgetCard(onchain.uri);
      await rebuildIndex().catch(() => undefined);
    });
    return NextResponse.json(card);
  } catch (e) {
    return errorResponse(e, "spawn/identity");
  }
}
