import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isAddress, parseUnits, verifyMessage } from "viem";
import { ARC_CHAIN, ARC_NETWORK, ARC_USDC, CIRCLE_LIVE, OWNER_ADDRESS, SITE_URL, explorerAddress, explorerTx } from "@/lib/config";
import { AGENT_MODE, agentAddress, agentBalances, agentGateway, gasBalance, sendFrom, validatorAddress } from "@/lib/agentWallet";
import { ERC8004, IDENTITY_ABI, explorerAgent, getHouseAgentId, mintedAgentId, readAgent, setHouseAgentId } from "@/lib/erc8004";
import { setupMessage } from "@/lib/setupMessage";
import { allow } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Owner-only setup. A call is authorised by either:
 *  - a fresh signature from FUCI_SELLER_ADDRESS (the owner's own wallet), or
 *  - the Circle API key, compared to CIRCLE_API_KEY (Circle Wallets mode).
 * Without either configured, only the public checklist is returned.
 */

type Action = "status" | "deposit" | "register-identity" | "fund-validator" | "scheduler" | "set-factory" | "register" | "diagnose" | "ciphertext" | "faucet";
type Body = {
  txHash?: string;
  action?: Action;
  amount?: number;
  apiKey?: string;
  wallet?: { address?: string; issuedAt?: number; signature?: `0x${string}` };
};

const sha = (s: string) => crypto.createHash("sha256").update(s).digest();

function keyMatches(apiKey: string | undefined) {
  const expected = process.env.CIRCLE_API_KEY;
  if (!expected || !apiKey) return false;
  return crypto.timingSafeEqual(sha(apiKey.trim()), sha(expected.trim()));
}

async function walletMatches(w: Body["wallet"]) {
  if (!OWNER_ADDRESS || !w?.address || !w.signature || typeof w.issuedAt !== "number") return false;
  if (!isAddress(w.address) || w.address.toLowerCase() !== OWNER_ADDRESS.toLowerCase()) return false;
  if (Math.abs(Date.now() - w.issuedAt) > 30 * 60_000) return false;
  return verifyMessage({ address: OWNER_ADDRESS, message: setupMessage(w.address, w.issuedAt), signature: w.signature }).catch(() => false);
}

/** Circle errors come back as axios-style errors; keep their HTTP status and Circle error code. */
const errorOf = (e: unknown) => {
  const err = e as { status?: number; code?: number | string; response?: { status?: number; data?: { code?: number | string; message?: string } }; shortMessage?: string; message?: string };
  const status = err?.response?.status ?? (typeof err?.status === "number" ? err.status : undefined);
  const code = err?.response?.data?.code ?? (typeof err?.code === "number" ? err.code : undefined);
  const message = err?.response?.data?.message ?? err?.shortMessage ?? err?.message ?? String(e);
  const parts = [status && `HTTP ${status}`, code !== undefined && code !== status && `code ${code}`, message].filter(Boolean);
  return { status: status && status >= 400 && status < 600 ? status : 502, message: parts.join(" · ") };
};

const envChecklist = () => ({
  FUCI_SELLER_ADDRESS: Boolean(OWNER_ADDRESS),
  AGENT_PRIVATE_KEY: AGENT_MODE === "self-managed",
  UPSTASH: Boolean(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL),
  CIRCLE_API_KEY: Boolean(process.env.CIRCLE_API_KEY),
  CIRCLE_ENTITY_SECRET: Boolean(process.env.CIRCLE_ENTITY_SECRET),
  NEXT_PUBLIC_CIRCLE_CLIENT_KEY: Boolean(process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY),
  NEXT_PUBLIC_FUCI_TOKEN: Boolean(process.env.NEXT_PUBLIC_FUCI_TOKEN),
  NEXT_PUBLIC_TITHE_ADDRESS: Boolean(process.env.NEXT_PUBLIC_TITHE_ADDRESS),
  ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
  ONRAMP_API_KEY: Boolean(process.env.ONRAMP_API_KEY),
  X_CLIENT: Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET),
  QSTASH_TOKEN: Boolean(process.env.QSTASH_TOKEN),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`setup:${ip}`, 30, 600))) {
    return NextResponse.json({ error: "Too many attempts. Wait 10 minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  const base = { network: ARC_NETWORK, mode: AGENT_MODE, owner: OWNER_ADDRESS, circleKey: Boolean(process.env.CIRCLE_API_KEY), env: envChecklist() };

  const byWallet = await walletMatches(body.wallet);
  const byKey = keyMatches(body.apiKey);
  if (!byWallet && !byKey) {
    // Before anything is configured, the public checklist is all there is to show.
    if (!OWNER_ADDRESS && !process.env.CIRCLE_API_KEY && (body.action ?? "status") === "status") {
      return NextResponse.json({ ...base, authed: false });
    }
    const hint = OWNER_ADDRESS ? "Sign in with the wallet set as FUCI_SELLER_ADDRESS." : "This API key does not match CIRCLE_API_KEY in Vercel.";
    return NextResponse.json({ error: hint }, { status: 401 });
  }

  try {
    switch (body.action) {
      case "deposit": {
        const amount = Math.min(Math.max(Number(body.amount) || 1, 0.1), 50);
        if (AGENT_MODE === "self-managed") {
          const r = await agentGateway().deposit(String(amount));
          return NextResponse.json({ ok: true, amount, deposit: r.depositTxHash, approve: r.approvalTxHash ?? null });
        }
        if (AGENT_MODE === "circle") {
          const c = await import("@/lib/circle");
          return NextResponse.json({ ok: true, amount, ...(await c.depositToGateway((await c.getWallet("agent")).id, amount)) });
        }
        return NextResponse.json({ error: "Set AGENT_PRIVATE_KEY first." }, { status: 412 });
      }
      case "register-identity": {
        // Mint the house agent's ERC-8004 identity; its tokenURI is the registration file.
        const existing = await getHouseAgentId();
        if (existing !== null) return NextResponse.json({ ok: true, agentId: existing, explorer: explorerAgent(existing) });
        const me = await agentAddress();
        const receipt = await sendFrom("agent", ARC_CHAIN, { address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "register", args: [`${SITE_URL}/.well-known/agent-card.json`] });
        const agentId = mintedAgentId(receipt, me ?? undefined);
        if (agentId === null) throw new Error(`Registered, but no identity was minted to the agent (tx ${receipt.transactionHash})`);
        await setHouseAgentId(agentId);
        return NextResponse.json({ ok: true, agentId, explorer: explorerAgent(agentId), tx: explorerTx(receipt.transactionHash) });
      }
      case "fund-validator": {
        // Move a little USDC (Arc gas) from the agent to the Tide checker validator.
        const validator = validatorAddress();
        if (!validator) return NextResponse.json({ error: "Set AGENT_PRIVATE_KEY first." }, { status: 412 });
        const amount = Math.min(Math.max(Number(body.amount) || 0.05, 0.01), 1);
        const receipt = await sendFrom("agent", ARC_CHAIN, {
          address: ARC_USDC,
          abi: [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
          functionName: "transfer",
          args: [validator, parseUnits(String(amount), 6)],
        });
        return NextResponse.json({ ok: true, amount, tx: explorerTx(receipt.transactionHash) });
      }
      case "scheduler": {
        // One QStash schedule drives every agent's automation: POST the tick every 5 minutes.
        const token = process.env.QSTASH_TOKEN;
        if (!token) return NextResponse.json({ error: "Add QSTASH_TOKEN in Vercel (Upstash console → QStash), or paste the tick URL into any cron service." }, { status: 412 });
        const { tickSecret } = await import("@/lib/agentWallets");
        const destination = `${req.nextUrl.origin}/api/automation/tick`;
        const base = (process.env.QSTASH_URL || "https://qstash.upstash.io").replace(/\/$/, "");
        const res = await fetch(`${base}/v2/schedules/${destination}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Upstash-Cron": "*/5 * * * *",
            "Upstash-Method": "POST",
            "Upstash-Schedule-Id": "fuci-automation-tick",
            "Upstash-Forward-Authorization": `Bearer ${tickSecret()}`,
          },
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) return NextResponse.json({ error: `QStash: ${(out as { error?: string }).error ?? res.status}` }, { status: 502 });
        return NextResponse.json({ ok: true, scheduleId: (out as { scheduleId?: string }).scheduleId ?? "fuci-automation-tick", every: "5 minutes" });
      }
      case "set-factory": {
        // The owner deployed FuciAgentFactory from /setup; check it on-chain before using it.
        if (!body.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) return NextResponse.json({ error: "txHash is required" }, { status: 400 });
        const { readClient } = await import("@/lib/chain");
        const { FACTORY_ABI } = await import("@/lib/factoryArtifact");
        const { saveFactoryAddress, factoryInfo } = await import("@/lib/factory");
        const { ERC8004 } = await import("@/lib/erc8004Abi");
        const c = readClient(ARC_CHAIN);
        const receipt = await c.waitForTransactionReceipt({ hash: body.txHash as `0x${string}`, timeout: 45_000 });
        const address = receipt.contractAddress;
        if (!address || receipt.status !== "success") return NextResponse.json({ error: "That transaction did not deploy a contract" }, { status: 400 });
        const read = (functionName: "owner" | "usdc" | "identityRegistry") => c.readContract({ address, abi: FACTORY_ABI, functionName }) as Promise<string>;
        const [owner, usdc, identity] = await Promise.all([read("owner"), read("usdc"), read("identityRegistry")]);
        if (owner.toLowerCase() !== (OWNER_ADDRESS ?? "").toLowerCase()) return NextResponse.json({ error: "The factory's owner must be your FUCI_SELLER_ADDRESS wallet" }, { status: 400 });
        if (usdc.toLowerCase() !== ARC_USDC.toLowerCase() || identity.toLowerCase() !== ERC8004.identity.toLowerCase()) return NextResponse.json({ error: "The factory points at the wrong USDC or registry" }, { status: 400 });
        await saveFactoryAddress(address);
        return NextResponse.json({ ok: true, factory: await factoryInfo(), tx: explorerTx(receipt.transactionHash) });
      }
      // Circle Wallets mode (optional): these need the Circle API key.
      case "register":
      case "diagnose":
      case "ciphertext":
      case "faucet": {
        const key = process.env.CIRCLE_API_KEY;
        if (!key) return NextResponse.json({ error: "CIRCLE_API_KEY is not set." }, { status: 412 });
        const c = await import("@/lib/circle");
        if (body.action === "diagnose") return NextResponse.json(await c.diagnoseCircle(key));
        if (body.action === "ciphertext") return NextResponse.json(await c.entitySecretCiphertext(key), { headers: { "Cache-Control": "no-store" } });
        if (body.action === "register") {
          if (process.env.CIRCLE_ENTITY_SECRET) return NextResponse.json({ error: "CIRCLE_ENTITY_SECRET is already set." }, { status: 409 });
          return NextResponse.json(await c.registerEntitySecret(key), { headers: { "Cache-Control": "no-store" } });
        }
        if (!CIRCLE_LIVE) return NextResponse.json({ error: "Set CIRCLE_ENTITY_SECRET first." }, { status: 412 });
        await c.requestFaucet((await c.getWallet("agent")).address);
        return NextResponse.json({ ok: true });
      }
    }

    // status (default)
    const agent = await agentAddress().catch(() => null);
    let balances: { walletUsdc: number | null; gatewayUsdc: number | null } = { walletUsdc: null, gatewayUsdc: null };
    if (AGENT_MODE === "self-managed") {
      balances = await agentBalances().catch(() => balances);
    } else if (AGENT_MODE === "circle" && agent) {
      const c = await import("@/lib/circle");
      const w = await c.getWallet("agent");
      balances = { walletUsdc: await c.usdcBalance(w.id).catch(() => null), gatewayUsdc: await c.gatewayBalance(w.address).catch(() => null) };
    }
    const seller = await (await import("@/lib/circle")).sellerAddress().catch(() => null);
    const validator = validatorAddress();
    const houseId = await getHouseAgentId().catch(() => null);
    const [house, validatorGas] = await Promise.all([
      houseId === null ? null : readAgent(houseId).catch(() => null),
      validator ? gasBalance(ARC_CHAIN, validator).catch(() => null) : null,
    ]);
    return NextResponse.json({
      ...base,
      authed: true,
      keyKind: process.env.CIRCLE_API_KEY ? (process.env.CIRCLE_API_KEY.startsWith("TEST_") ? "test" : "live") : null,
      agent: agent ? { address: agent, explorer: explorerAddress(agent), ...balances } : null,
      seller: seller ? { address: seller, explorer: explorerAddress(seller) } : null,
      erc8004: {
        agentId: houseId,
        explorer: houseId === null ? null : explorerAgent(houseId),
        uri: house?.uri ?? null,
        validator: validator ? { address: validator, explorer: explorerAddress(validator), gasUsdc: validatorGas } : null,
      },
      factory: await (await import("@/lib/factory")).factoryInfo().catch(() => null),
      trading: await (async () => ({ feesUsdc: await (await import("@/lib/store")).tradeFeesTotal(), treasury: await (await import("@/lib/trade")).tradeTreasury() }))().catch(() => null),
      automation: await (async () => {
        const { tickSecret } = await import("@/lib/agentWallets");
        return { tickUrl: `${req.nextUrl.origin}/api/automation/tick`, secret: tickSecret(), qstash: Boolean(process.env.QSTASH_TOKEN) };
      })().catch(() => null),
    });
  } catch (e) {
    const { status, message } = errorOf(e);
    return NextResponse.json({ error: message }, { status });
  }
}

/** Public, non-secret view of what is configured (drives the /setup steps before sign-in). */
export function GET() {
  return NextResponse.json({ network: ARC_NETWORK, mode: AGENT_MODE, owner: OWNER_ADDRESS, circleKey: Boolean(process.env.CIRCLE_API_KEY), env: envChecklist() });
}
