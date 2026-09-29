import Anthropic from "@anthropic-ai/sdk";
import { FUCI_TOKEN } from "./config";

/**
 * Turns an owner's chat message into an agent command (or "just a question"). Claude only proposes:
 * the page shows the exact action and nothing moves until the owner confirms and signs it, through
 * the same verified endpoints the buttons use.
 */
export type Command =
  | { type: "earn_deposit"; amount: number | "all"; vault?: string }
  | { type: "earn_withdraw"; vault?: string }
  | { type: "dca_add"; token: string; usdc: number; everyHours: number; totalUsdc: number; hold: boolean }
  | { type: "dca_stop"; token?: string }
  | { type: "autopilot"; on: boolean }
  | { type: "sell"; token: string; pct: number }
  | { type: "buy"; token: string; usdc: number };

export type Context = {
  usdc: number | null;
  positions: { symbol: string; token: string }[];
  earn: { vault: string; name: string; balance: number }[];
  dca: { token: string; usdc: number; everyHours: number }[];
  autopilotOn: boolean;
};

const DCA_HOURS = [1, 4, 6, 12, 24, 72, 168];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const TOOL = {
  name: "agent_command",
  description: "What the owner wants the agent to do. Use kind=question when the message is a question about the market, not an instruction.",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: {
        type: "string",
        enum: ["question", "earn_deposit", "earn_withdraw", "dca_add", "dca_stop", "autopilot_on", "autopilot_off", "sell", "buy"],
      },
      amount: { type: "string", description: "USDC amount as a number, or 'all' (earn_deposit, buy, dca_add per buy)" },
      token: { type: "string", description: "Token: a 0x address, a symbol like FUCI, or 'all' (sell)" },
      every_hours: { type: "number", description: "dca_add: hours between buys (1, 4, 6, 12, 24, 72 or 168)" },
      total_usdc: { type: "number", description: "dca_add: stop after this much in total; 0 for no cap" },
      percent: { type: "number", description: "sell: percent of the position, 1-100" },
      vault: { type: "string", description: "earn: a vault name if the owner named one" },
    },
    required: ["kind"],
  },
};

/** Resolve a symbol or address the owner typed into a token address, using what the agent holds. */
function tokenOf(raw: string | undefined, ctx: Context): string | null {
  const t = (raw ?? "").trim().replace(/^\$/, "");
  if (ADDRESS.test(t)) return t.toLowerCase();
  if (/^fuci$/i.test(t)) return FUCI_TOKEN.toLowerCase();
  const held = ctx.positions.find((p) => p.symbol.toLowerCase() === t.toLowerCase());
  return held ? held.token.toLowerCase() : null;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

type Parsed = Command | { type: "question" } | { type: "unclear"; why: string };

const HOURS: [RegExp, number][] = [
  [/\b(every|each|per)\s+(hour|hr)\b|hourly/i, 1],
  [/\b(every|each|per)\s+day\b|daily/i, 24],
  [/\b(every|each|per)\s+week\b|weekly/i, 168],
];

/** The amount the owner typed: "$5", "5 usdc", "5" (not a number inside a 0x address). */
function amountIn(text: string): number | null {
  const m = text.replace(/0x[0-9a-fA-F]{40}/g, " ").match(/\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usdc|usd|\$|dollars?)?/i);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
const saysAll = (text: string) => /\b(all|everything|max|entire|whole|semua)\b/i.test(text);

/**
 * Clear commands are read without AI: they are the common case, and they must never be mistaken for a
 * (paid) question. Anything this can't read goes to Claude.
 */
export function quickParse(prompt: string, ctx: Context): Parsed | null {
  const p = prompt.trim();
  const tokenWord = (after: RegExp) => {
    const addr = p.match(/0x[0-9a-fA-F]{40}/)?.[0];
    if (addr) return tokenOf(addr, ctx);
    const w = p.match(after)?.[1];
    const direct = w ? tokenOf(w, ctx) : null;
    if (direct) return direct;
    // Any token the agent holds (or $FUCI) named anywhere in the message.
    const words = p.toLowerCase().match(/\$?[a-z0-9]{2,12}/g) ?? [];
    for (const word of words) {
      const t = tokenOf(word, ctx);
      if (t) return t;
    }
    return null;
  };
  if (/\b(withdraw|take|pull|unstake|remove|get)\b.*\b(out|back|from)?\b.*\b(earn|vault|yield)\b/i.test(p) && !/\b(put|stake|deposit)\b/i.test(p)) {
    if (!ctx.earn.length) return { type: "unclear", why: "There's nothing in Earn to take out." };
    return { type: "earn_withdraw" };
  }
  if (/\b(stake|deposit|put|save|move|park|lend)\b/i.test(p) && /\b(earn|vault|yield|lending|interest)\b/i.test(p)) {
    if (saysAll(p)) return { type: "earn_deposit", amount: "all" };
    const n = amountIn(p);
    return n ? { type: "earn_deposit", amount: n } : { type: "unclear", why: "How much should go into Earn? Say an amount, or \"all\"." };
  }
  if (/\b(stop|pause|turn off|disable|halt)\b.*\bautopilot\b|\bautopilot\b.*\b(off|stop)\b/i.test(p)) return { type: "autopilot", on: false };
  if (/\b(start|resume|turn on|enable|run)\b.*\bautopilot\b|\bautopilot\b.*\bon\b/i.test(p)) return { type: "autopilot", on: true };
  if (/\bdca\b/i.test(p)) {
    if (/\b(stop|cancel|end|remove)\b/i.test(p)) return { type: "dca_stop", token: tokenWord(/\bdca\s+\$?([a-z]{2,12})\b/i) ?? undefined };
    const token = tokenWord(/\bdca\s+(?:into\s+)?\$?([a-z]{2,12})\b/i) ?? tokenWord(/\$([a-z]{2,12})\b/i);
    const usdc = amountIn(p);
    if (!token) return { type: "unclear", why: "Which token? Say $FUCI or paste its contract (0x…)." };
    if (!usdc) return { type: "unclear", why: "How much per buy? For example: DCA $FUCI 2 USDC every hour." };
    const everyN = p.match(/every\s+(\d+)\s*(h|hr|hrs|hours?|d|days?)\b/i);
    const raw = everyN ? Number(everyN[1]) * (/^d/i.test(everyN[2]) ? 24 : 1) : (HOURS.find(([re]) => re.test(p))?.[1] ?? 24);
    const h = DCA_HOURS.reduce((best, v) => (Math.abs(v - raw) < Math.abs(best - raw) ? v : best), 24);
    return { type: "dca_add", token, usdc: Math.min(100, usdc), everyHours: h, totalUsdc: 0, hold: true };
  }
  if (/^\s*sell\b/i.test(p)) {
    if (/^\s*sell\s+(all|everything)\s*$/i.test(p)) return { type: "sell", token: "all", pct: 100 };
    const token = tokenWord(/^\s*sell\s+(?:all\s+|half\s+)?(?:my\s+|of\s+)?\$?([a-z]{2,12})\b/i);
    if (!token) return { type: "unclear", why: "Which token should it sell? Say its symbol, or \"sell all\"." };
    const pctM = p.match(/(\d+)\s*%/);
    return { type: "sell", token, pct: /\bhalf\b/i.test(p) ? 50 : pctM ? Math.min(100, Math.max(1, Number(pctM[1]))) : 100 };
  }
  if (/^\s*buy\b/i.test(p)) {
    const token = tokenWord(/\b(?:of|some)\s+\$?([a-z]{2,12})\b/i) ?? tokenWord(/\$([a-z]{2,12})\b/i);
    const usdc = amountIn(p);
    if (!token) return { type: "unclear", why: "Which token? Say $FUCI or paste its contract (0x…)." };
    if (!usdc) return { type: "unclear", why: "How much USDC should it spend?" };
    return { type: "buy", token, usdc: Math.min(100, usdc) };
  }
  return null;
}

export async function parseCommand(prompt: string, ctx: Context): Promise<Parsed> {
  const quick = quickParse(prompt, ctx);
  if (quick) return quick;
  if (!process.env.ANTHROPIC_API_KEY) return { type: "question" };
  const client = new Anthropic();
  const response = await client.beta.messages
    .create({
    model: "claude-opus-5",
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_tokens: 400,
    output_config: { effort: "low" },
    system:
      "You read one chat message from the owner of a Fuci AI agent on the Arc blockchain and classify it. The agent can: put idle USDC into Earn " +
      "(lending vaults; words like stake, deposit, save, earn yield), take it out of Earn, add or stop a DCA plan (buy a token on a schedule), turn " +
      "its trading autopilot on or off, sell a token it holds, or buy a token. Anything else, including questions about tokens or the market, is " +
      "kind=question. Never invent amounts or tokens the owner didn't say; leave them out instead.",
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content: `Agent now: ${ctx.usdc ?? "?"} USDC in its wallet; holds ${ctx.positions.map((p) => "$" + p.symbol).join(", ") || "no tokens"}; ${
          ctx.earn.length ? `in Earn: ${ctx.earn.map((e) => `${e.balance} in ${e.name}`).join(", ")}` : "nothing in Earn"
        }; autopilot ${ctx.autopilotOn ? "on" : "off"}.\n\nOwner's message: ${prompt}`,
      },
    ],
    })
    .catch((e: unknown) => {
      console.error("[intent] Claude call failed:", (e as Error)?.message);
      return null;
    });
  // If Claude is unavailable, treat the message as a question: asking is the safe default.
  if (!response || response.stop_reason === "refusal") return { type: "question" };
  const use = response.content.find((b) => b.type === "tool_use");
  const x = (use && "input" in use ? use.input : {}) as { kind?: string; amount?: string; token?: string; every_hours?: number; total_usdc?: number; percent?: number; vault?: string };

  switch (x.kind) {
    case "earn_deposit": {
      const all = /all|max|everything|semua/i.test(String(x.amount ?? ""));
      const n = num(x.amount);
      if (!all && !n) return { type: "unclear", why: "How much should go into Earn? Say an amount, or \"all\"." };
      return { type: "earn_deposit", amount: all ? "all" : n!, vault: x.vault };
    }
    case "earn_withdraw":
      if (!ctx.earn.length) return { type: "unclear", why: "There's nothing in Earn to take out." };
      return { type: "earn_withdraw", vault: x.vault };
    case "dca_add": {
      const token = tokenOf(x.token, ctx);
      const usdc = num(x.amount);
      if (!token) return { type: "unclear", why: "Which token? Say $FUCI or paste its contract (0x…)." };
      if (!usdc) return { type: "unclear", why: "How much per buy? For example: DCA $FUCI 2 USDC every hour." };
      const h = DCA_HOURS.reduce((best, v) => (Math.abs(v - (x.every_hours ?? 24)) < Math.abs(best - (x.every_hours ?? 24)) ? v : best), 24);
      return { type: "dca_add", token, usdc: Math.min(100, usdc), everyHours: h, totalUsdc: Math.max(0, Number(x.total_usdc) || 0), hold: true };
    }
    case "dca_stop":
      return { type: "dca_stop", token: tokenOf(x.token, ctx) ?? undefined };
    case "autopilot_on":
      return { type: "autopilot", on: true };
    case "autopilot_off":
      return { type: "autopilot", on: false };
    case "sell": {
      const all = /^all$/i.test((x.token ?? "").trim());
      const token = all ? "all" : tokenOf(x.token, ctx);
      if (!token) return { type: "unclear", why: "Which token should it sell? Say its symbol, or \"sell all\"." };
      const pct = Math.min(100, Math.max(1, Math.round(Number(x.percent) || 100)));
      return { type: "sell", token, pct };
    }
    case "buy": {
      const token = tokenOf(x.token, ctx);
      const usdc = num(x.amount);
      if (!token) return { type: "unclear", why: "Which token? Say $FUCI or paste its contract (0x…)." };
      if (!usdc) return { type: "unclear", why: "How much USDC should it spend?" };
      return { type: "buy", token, usdc: Math.min(100, usdc) };
    }
    default:
      return { type: "question" };
  }
}
