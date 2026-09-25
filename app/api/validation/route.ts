import { NextResponse, type NextRequest } from "next/server";
import { keccak256, toHex } from "viem";
import { ARC_CHAIN, SITE_URL, explorerTx } from "@/lib/config";
import { sendFrom, validatorAddress } from "@/lib/agentWallet";
import { ERC8004, VALIDATION_ABI, getHouseAgentId, validationStatus } from "@/lib/erc8004";
import { getRun, isHash } from "@/lib/runs";
import { reexecute } from "@/lib/validator";
import { allow, getAgent, kvSet, pushHistory } from "@/lib/store";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Validate a run on ERC-8004:
 *   1. the house agent (owner of its agentId) posts validationRequest(validator, agentId, runURI, runHash)
 *   2. the Tide checker re-reads every claim from Arc and posts validationResponse(runHash, score, reportURI, reportHash)
 * Both cost a little USDC gas, so this is rate limited per visitor and per day.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { hash?: string };
  const hash = body.hash ?? "";
  if (!isHash(hash)) return NextResponse.json({ error: "A run hash is required" }, { status: 400 });

  const existing = await validationStatus(hash).catch(() => null);
  if (existing?.responded) return NextResponse.json({ status: existing, report: `${SITE_URL}/api/runs/${hash}/validation` });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`validate:${ip}`, 3, 600)) || !(await allow("validate:day", 20, 86_400))) {
    return NextResponse.json({ error: "Validation is resting (rate limit). Try again later." }, { status: 429 });
  }
  const [run, agentId] = await Promise.all([getRun(hash), getHouseAgentId()]);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (agentId === null) return NextResponse.json({ error: "The house agent is not registered on ERC-8004 yet (see /setup)" }, { status: 412 });
  const validator = validatorAddress();
  if (!validator) return NextResponse.json({ error: "The validator needs AGENT_PRIVATE_KEY" }, { status: 412 });

  try {
    let requestTx: string | null = null;
    if (!existing) {
      const r = await sendFrom("agent", ARC_CHAIN, {
        address: ERC8004.validation,
        abi: VALIDATION_ABI,
        functionName: "validationRequest",
        args: [validator, BigInt(agentId), `${SITE_URL}/api/runs/${hash}`, hash],
      });
      requestTx = r.transactionHash;
    }
    const report = await reexecute(run, validator);
    await kvSet(`validation:${hash.toLowerCase()}`, report);
    const r = await sendFrom("validator", ARC_CHAIN, {
      address: ERC8004.validation,
      abi: VALIDATION_ABI,
      functionName: "validationResponse",
      args: [hash, report.score, `${SITE_URL}/api/runs/${hash}/validation`, keccak256(toHex(JSON.stringify(report))), "fuci-reexec"],
    });
    if (await getAgent(run.agent).catch(() => null)) {
      await pushHistory(run.agent, { kind: "validation", label: `Run validated on ERC-8004: ${report.score}/100`, href: explorerTx(r.transactionHash) });
    }
    return NextResponse.json({
      status: await validationStatus(hash),
      report,
      requestTx: requestTx && explorerTx(requestTx),
      responseTx: explorerTx(r.transactionHash),
    });
  } catch (e) {
    return errorResponse(e, "validation");
  }
}
