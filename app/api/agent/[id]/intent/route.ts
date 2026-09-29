import { NextResponse, type NextRequest } from "next/server";
import { allow } from "@/lib/store";
import { OwnerError, verifyOwner } from "@/lib/ownerAuth";
import { errorResponse } from "@/lib/http";
import { parseCommand, type Command } from "@/lib/intent";
import { earnState, earnVaults } from "@/lib/earn";
import { FUCI_TOKEN } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Same once-a-day owner signature as asking (see the ask route). */
const SESSION_MS = 24 * 60 * 60_000;
/** Left in the wallet for gas when "all" goes into Earn. */
const KEEP_FOR_GAS = 0.05;

type Body = { prompt?: string; address?: string; issuedAt?: number; signature?: string };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const every = (h: number) => (h === 1 ? "every hour" : h < 24 ? `every ${h} hours` : h === 24 ? "every day" : h === 168 ? "every week" : `every ${h / 24} days`);

/**
 * Owner-only: read a chat message as a command. Returns {kind:"question"} to answer it as usual, or
 * {kind:"action"} with the exact action for the owner to confirm and sign. Nothing moves here.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`intent:${ip}`, 30, 600))) return NextResponse.json({ error: "Too many messages. Try again in a few minutes." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as Body;
  const prompt = (b.prompt ?? "").trim().slice(0, 500);
  if (!prompt) return NextResponse.json({ kind: "question" });
  try {
    const agent = await verifyOwner(id, "ask", b, "session", SESSION_MS, { singleUse: false });
    const [{ positionsView }, earn, vaults] = await Promise.all([import("@/lib/trading"), earnState(agent.id, agent.wallet).catch(() => null), earnVaults().catch(() => [])]);
    const held = agent.wallet ? await positionsView(agent.id).catch(() => []) : [];
    const t = agent.trading;
    const ctx = {
      usdc: earn?.wallet.usdc ?? null,
      positions: held.map((p) => ({ symbol: p.symbol, token: p.token })),
      earn: (earn?.positions ?? []).map((p) => ({ vault: p.vault, name: p.name, balance: p.balance })),
      dca: (t?.rules ?? []).flatMap((r) => (r.kind === "dca" ? [{ token: r.token, usdc: r.usdc, everyHours: r.everyHours }] : [])),
      autopilotOn: Boolean(t?.enabled),
    };
    const c = await parseCommand(prompt, ctx);
    if (c.type === "question") return NextResponse.json({ kind: "question" });
    if (c.type === "unclear") return NextResponse.json({ kind: "unclear", message: c.why });

    const symbolOf = (token: string) =>
      token.toLowerCase() === FUCI_TOKEN.toLowerCase() ? "$FUCI" : held.find((p) => p.token.toLowerCase() === token.toLowerCase())?.symbol ? `$${held.find((p) => p.token.toLowerCase() === token.toLowerCase())!.symbol}` : short(token);

    const out = (command: Command, summary: string, note?: string) => NextResponse.json({ kind: "action", command, summary, note });

    switch (c.type) {
      case "earn_deposit": {
        const named = c.vault ? vaults.find((v) => v.status === "active" && v.asset === "USDC" && v.name.toLowerCase().includes(c.vault!.toLowerCase())) : undefined;
        // Default: the best-paying active USDC vault that holds real money.
        const v = named ?? vaults.filter((x) => x.status === "active" && x.asset === "USDC" && x.tvl >= 100_000).sort((a, z) => z.apy - a.apy)[0];
        if (!v) return NextResponse.json({ kind: "unclear", message: "No USDC vault is open for deposits right now." });
        const have = ctx.usdc ?? 0;
        const amount = c.amount === "all" ? Math.floor((have - KEEP_FOR_GAS) * 1e6) / 1e6 : Math.min(c.amount, have);
        if (!(amount >= 0.1)) return NextResponse.json({ kind: "unclear", message: `The agent wallet has ${have.toFixed(2)} USDC: not enough to put into Earn.` });
        return out(
          { type: "earn_deposit", amount, vault: v.address },
          `Put ${amount.toFixed(2)} USDC into ${v.name} (${pct(v.apy)} APY).`,
          ctx.autopilotOn ? "The autopilot can't spend money that's in Earn until you take it out." : `Keeps ${KEEP_FOR_GAS} USDC in the wallet for gas.`,
        );
      }
      case "earn_withdraw": {
        const list = c.vault ? ctx.earn.filter((e) => e.name.toLowerCase().includes(c.vault!.toLowerCase())) : ctx.earn;
        if (!list.length) return NextResponse.json({ kind: "unclear", message: "There's nothing in that vault." });
        return out(
          { type: "earn_withdraw", vault: list.length === 1 ? list[0].vault : undefined },
          `Take ${list.map((e) => `${e.balance.toFixed(2)} USDC out of ${e.name}`).join(" and ")} back to the agent wallet.`,
          "Fuci takes 10% of the yield earned, never the deposit.",
        );
      }
      case "dca_add":
        return out(c, `Buy ${c.usdc} USDC of ${symbolOf(c.token)} ${every(c.everyHours)}${c.totalUsdc ? `, up to ${c.totalUsdc} USDC in total` : ""}. Never auto-sold.`, ctx.autopilotOn ? undefined : "This also turns the autopilot on.");
      case "dca_stop": {
        const plans = ctx.dca.filter((d) => !c.token || d.token.toLowerCase() === c.token.toLowerCase());
        if (!plans.length) return NextResponse.json({ kind: "unclear", message: "There's no DCA plan to stop." });
        return out(c, `Stop DCA for ${plans.map((d) => symbolOf(d.token)).join(", ")}. Tokens already bought stay in the wallet.`);
      }
      case "autopilot":
        return out(c, c.on ? "Turn the autopilot on with your saved strategy." : "Turn the autopilot off. Positions stay as they are.");
      case "sell":
        return out(c, c.token === "all" ? "Sell every token the agent holds for USDC." : `Sell ${c.pct}% of ${symbolOf(c.token)} for USDC.`);
      case "buy":
        return out(c, `Buy ${c.usdc} USDC of ${symbolOf(c.token)} now.`);
    }
  } catch (e) {
    if (e instanceof OwnerError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e, "intent");
  }
}
