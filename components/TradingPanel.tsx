"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "./CopyButton";
import { BuyUsdc } from "./BuyUsdc";
import { fmtPrice } from "./TokenCard";
import type { Activity, Pnl, TradingOps } from "./useTrading";
import { FUCI_TOKEN, SITE_URL, X_HANDLE } from "@/lib/config";
import { DEFAULT_MAX_BUY_TAX_PCT, SMART_DEFAULTS, TRADE_FEE_PCT, type SmartFilters, type TradeRule, type TradingSettings } from "@/lib/tradingRules";

/** The checklist the owner edits; turned into rules on save. */
type Form = {
  enabled: boolean;
  perTradeUsdc: number;
  dailyUsdc: number;
  slippagePct: number;
  snipe: { on: boolean; usdc: number };
  grad: { on: boolean; usdc: number };
  /** Skip new launches and bondings with a higher Argus buy tax. */
  maxTax: number;
  tp: { on: boolean; pct: number; sellPct: number };
  sl: { on: boolean; pct: number };
  dev: { on: boolean };
  /** Smart entry: watch, then buy only what passes the filters. */
  smart: { on: boolean; usdc: number } & SmartFilters;
  trail: { on: boolean; pct: number };
  timeExit: { on: boolean; hours: number; minGainPct: number };
  /** DCA plans: buy a fixed amount of a chosen token on a schedule. */
  dca: { id: string; token: string; usdc: number; everyHours: number; totalUsdc: number; hold: boolean }[];
};

const DCA_EVERY = [1, 4, 6, 12, 24, 72, 168];
const MAX_DCA = 5;

function toForm(s: TradingSettings, fresh: boolean): Form {
  const find = <K extends TradeRule["kind"]>(k: K) => s.rules.find((r) => r.kind === k) as Extract<TradeRule, { kind: K }> | undefined;
  const snipe = find("snipe-new");
  const grad = find("buy-graduated");
  const tp = find("take-profit");
  const sl = find("stop-loss");
  const smart = find("smart-buy");
  const trail = find("trailing-stop");
  const te = find("time-exit");
  return {
    enabled: s.enabled,
    perTradeUsdc: s.perTradeUsdc,
    dailyUsdc: s.dailyUsdc,
    slippagePct: s.slippagePct,
    // A first-time setup starts with the safety rules ticked.
    snipe: { on: Boolean(snipe), usdc: snipe?.usdc ?? 1 },
    grad: { on: Boolean(grad), usdc: grad?.usdc ?? 1 },
    maxTax: snipe?.maxBuyTaxPct ?? grad?.maxBuyTaxPct ?? DEFAULT_MAX_BUY_TAX_PCT,
    tp: { on: fresh || Boolean(tp), pct: tp?.pct ?? 100, sellPct: tp?.sellPct ?? 50 },
    sl: { on: fresh || Boolean(sl), pct: sl?.pct ?? 50 },
    dev: { on: fresh || Boolean(find("dev-sell")) },
    // New setups start with smart entry rather than buying everything on sight.
    smart: { ...SMART_DEFAULTS, ...(smart ?? {}), on: fresh || Boolean(smart), usdc: smart?.usdc ?? 1 },
    trail: { on: fresh || Boolean(trail), pct: trail?.pct ?? 25 },
    timeExit: { on: Boolean(te), hours: te?.hours ?? 24, minGainPct: te?.minGainPct ?? 10 },
    dca: s.rules.flatMap((r) => (r.kind === "dca" ? [{ id: r.id, token: r.token, usdc: r.usdc, everyHours: r.everyHours, totalUsdc: r.totalUsdc, hold: r.hold }] : [])),
  };
}

/** `orders` are the limit orders placed from token cards; they are kept as they are. */
function toSettings(f: Form, orders: TradeRule[], enabled = f.enabled): TradingSettings {
  // DCA first, so scheduled buys go before any opportunistic ones within the per-tick limit.
  const rules: TradeRule[] = f.dca.filter((d) => d.token.trim()).map((d) => ({ kind: "dca" as const, ...d, token: d.token.trim() }));
  if (f.snipe.on) rules.push({ id: "snipe", kind: "snipe-new", usdc: f.snipe.usdc, maxBuyTaxPct: f.maxTax });
  if (f.grad.on) rules.push({ id: "grad", kind: "buy-graduated", usdc: f.grad.usdc, maxBuyTaxPct: f.maxTax });
  if (f.smart.on) {
    const { on: _on, ...smart } = f.smart;
    void _on;
    rules.push({ id: "smart", kind: "smart-buy", ...smart });
  }
  if (f.tp.on) rules.push({ id: "tp", kind: "take-profit", pct: f.tp.pct, sellPct: f.tp.sellPct });
  if (f.trail.on) rules.push({ id: "trail", kind: "trailing-stop", pct: f.trail.pct });
  if (f.timeExit.on) rules.push({ id: "time", kind: "time-exit", hours: f.timeExit.hours, minGainPct: f.timeExit.minGainPct });
  if (f.sl.on) rules.push({ id: "sl", kind: "stop-loss", pct: f.sl.pct });
  if (f.dev.on) rules.push({ id: "dev", kind: "dev-sell" });
  return { enabled, perTradeUsdc: f.perTradeUsdc, dailyUsdc: f.dailyUsdc, slippagePct: f.slippagePct, rules: [...rules, ...orders] };
}

function N({ value, onChange, w = "w-16", step = 1, label }: { value: number; onChange: (v: number) => void; w?: string; step?: number; label: string }) {
  return (
    <input
      type="number"
      min={0}
      step={step}
      aria-label={label}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${w} field px-2 py-1 font-mono text-sm`}
    />
  );
}

function Row({ on, set, hint, children }: { on: boolean; set: (on: boolean) => void; hint: string; children: React.ReactNode }) {
  return (
    <li className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${on ? "border-ink/60" : "border-line text-ink-2"}`}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-1.5 size-4 shrink-0 accent-current" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">{children}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
    </li>
  );
}

/** One-tap starting points; every value stays editable below. */
const PRESETS: { id: string; label: string; body: string; apply: (f: Form) => Form }[] = [
  {
    id: "careful",
    label: "Careful",
    body: "Smart entry on bonded tokens only, with a passing risk grade and strict filters. Small amounts.",
    apply: (f) => ({
      ...f,
      snipe: { ...f.snipe, on: false },
      grad: { ...f.grad, on: false },
      smart: { ...SMART_DEFAULTS, on: true, usdc: 1, source: "bonded", minBuyers: 20, minNetUsdc: 100, maxDevPct: 3, maxCreatorLaunches: 2, minGrade: "C", minSocials: 2, maxBundlePct: 3, maxTopWalletPct: 20, maxRoundTripPct: 40 },
      tp: { on: true, pct: 50, sellPct: 50 },
      sl: { on: true, pct: 25 },
      trail: { on: true, pct: 20 },
      timeExit: { on: true, hours: 24, minGainPct: 5 },
      dev: { on: true },
      perTradeUsdc: 1,
      dailyUsdc: 5,
    }),
  },
  {
    id: "balanced",
    label: "Balanced",
    body: "Smart entry on new launches and bondings: waits 10 minutes, then needs real buyers and inflow.",
    apply: (f) => ({
      ...f,
      snipe: { ...f.snipe, on: false },
      grad: { ...f.grad, on: false },
      smart: { ...SMART_DEFAULTS, on: true, usdc: 1 },
      tp: { on: true, pct: 100, sellPct: 50 },
      sl: { on: true, pct: 40 },
      trail: { on: true, pct: 25 },
      timeExit: { on: true, hours: 12, minGainPct: 10 },
      dev: { on: true },
      perTradeUsdc: 2,
      dailyUsdc: 10,
    }),
  },
  {
    id: "degen",
    label: "Degen",
    body: "Buys every new launch and bonding on sight, no filters. Most are rugs: expect to lose most bets.",
    apply: (f) => ({
      ...f,
      smart: { ...f.smart, on: false },
      snipe: { on: true, usdc: 1 },
      grad: { on: true, usdc: 1 },
      tp: { on: true, pct: 100, sellPct: 50 },
      sl: { on: true, pct: 50 },
      trail: { on: false, pct: f.trail.pct },
      timeExit: { on: false, hours: f.timeExit.hours, minGainPct: f.timeExit.minGainPct },
      dev: { on: true },
      perTradeUsdc: 2,
      dailyUsdc: 10,
    }),
  },
];

/** A collapsible block: title and a one-line summary when closed, the full controls when open. */
function Section({ id, title, summary, defaultOpen, children }: { id?: string; title: string; summary?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details id={id} open={defaultOpen || undefined} className="group scroll-mt-24 rounded-md border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/40">
        <span className="font-semibold">{title}</span>
        <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
          <span className="truncate">{summary}</span>
          <span aria-hidden="true" className="shrink-0 transition group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const clock = (at: number) => new Date(at).toISOString().slice(11, 16) + " UTC";

/** Live proof the autopilot is working: when it last checked, what it found, and its latest moves. */
/** Profit so far across every autopilot trade, with a link to the public share card. */
function PnlRow({ pnl, agentId }: { pnl: Pnl; agentId: string }) {
  const up = pnl.pnlUsdc >= 0;
  const sign = up ? "+" : "−";
  const usdc = `${sign}${Math.abs(pnl.pnlUsdc).toFixed(2)} USDC`;
  const pct = pnl.pnlPct == null ? "" : ` (${sign}${Math.abs(pnl.pnlPct).toFixed(1)}%)`;
  const page = `${SITE_URL}/agent/${agentId}/pnl`;
  const text = `My AI agent on @${X_HANDLE} is ${usdc}${pct} on autopilot, trading on Arc by itself.`;
  return (
    <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 ${up ? "border-up/40 bg-up/5" : "border-down/40 bg-down/5"}`}>
      <div>
        <p className="text-xs uppercase tracking-widest text-muted">Profit / loss</p>
        <p className={`font-display mt-1 text-2xl font-semibold tabular-nums ${up ? "text-up" : "text-down"}`}>
          {usdc}
          <span className="ml-1 text-base font-normal">{pct}</span>
        </p>
        <p className="mt-1 text-xs text-ink-2">
          {pnl.buys + pnl.sells} trades · sold {pnl.soldUsdc.toFixed(2)} + holding {pnl.openValueUsdc.toFixed(2)} − bought {pnl.boughtUsdc.toFixed(2)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-primary !py-2" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(page)}`}>
          Share on X
        </a>
        <a className="btn btn-ghost !py-2" target="_blank" rel="noopener noreferrer" href={`/agent/${agentId}/pnl`}>
          View card
        </a>
      </div>
    </div>
  );
}

export function AutopilotStatus({ lastRunAt, lastResult, activity, enabled }: { lastRunAt?: number; lastResult?: string; activity: Activity[]; enabled: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  const since = lastRunAt && now ? now - lastRunAt : null;
  const next = since !== null ? Math.max(0, 5 - Math.floor(since / 60_000)) : null;
  const late = since !== null && since > 12 * 60_000;
  return (
    <div className="mt-3 border-t border-line pt-3" aria-live="polite">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className={`size-2 shrink-0 rounded-full ${enabled && !late ? "bg-up" : "bg-line"}`} />
        {lastRunAt ? (
          <>
            <b>Last check {since === null ? clock(lastRunAt) : ago(since)}</b>
            {enabled && !late && next !== null && <span className="text-ink-2">· next in about {next || 1} min</span>}
            {enabled && late && <span className="text-danger">· no check for a while: the scheduler may be off</span>}
          </>
        ) : (
          <b>{enabled ? "Waiting for the first check (within 5 minutes)" : "Not started yet"}</b>
        )}
      </p>
      {lastResult && <p className="mt-1 pl-4 text-sm text-ink-2">{lastResult}</p>}
      {activity.length > 0 && (
        <details className="mt-2 pl-4">
          <summary className="cursor-pointer text-xs text-ink-2 hover:text-ink">Recent activity ({activity.length})</summary>
        <ol className="mt-2 space-y-1.5">
          {activity.map((a, i) => (
            <li key={i} className="flex gap-3 text-xs">
              <span className="shrink-0 whitespace-nowrap font-mono text-muted">{clock(a.at).replace(" UTC", "")}</span>
              <span className="min-w-0 flex-1 break-words text-ink-2">
                {a.label}
                {a.href && (
                  <>
                    {" "}
                    <a href={a.href} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                      tx
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
        </details>
      )}
    </div>
  );
}

const GUIDE = [
  "Add USDC to your agent's own wallet. Only you can take it out.",
  "Pick a strategy. Your agent watches Argus, the token launchpad on Arc, every 5 minutes.",
  "Turn it on. It buys and sells by itself, never above your daily limit.",
];

/** Owner-only: fund the agent, pick what it trades, turn it on. */
export function Autopilot({ ops }: { ops: TradingOps }) {
  const { state, wallet, busy } = ops;
  const [form, setForm] = useState<Form | null>(null);
  const [fund, setFund] = useState(5);
  if (!state) return <p className="text-sm text-muted">Loading…</p>;
  if (!state.available) return <p className="text-sm text-muted">Trading runs on Arc mainnet only.</p>;
  const f = form ?? toForm(ops.settings(), !state.trading);
  const set = (patch: Partial<Form>) => setForm({ ...f, ...patch });
  const msg = (where: string) => (ops.msg?.where === where ? <p className={`mt-2 text-sm ${ops.msg.ok ? "text-up" : "text-danger"}`}>{ops.msg.text}</p> : null);
  // Always start from the saved orders, so one placed from a token card meanwhile is kept.
  const savedOrders = ops.settings().rules.filter((r) => r.kind === "limit-buy" || r.kind === "limit-sell");
  const save = async (enabled = f.enabled) => {
    if (await ops.save(toSettings(f, savedOrders, enabled))) setForm({ ...f, enabled });
  };
  const total = state.positions.reduce((s, p) => s + (p.valueUsdc ?? 0), 0);
  const orders = (state.trading?.rules ?? []).filter((r) => (r.kind === "limit-buy" || r.kind === "limit-sell") && !r.done);
  const cancel = (id: string) => ops.save(toSettings(f, savedOrders.filter((o) => o.id !== id)), "orders", "Order cancelled.");
  const nothingPicked = !f.snipe.on && !f.grad.on && !f.smart.on && !f.tp.on && !f.sl.on && !f.dev.on && !f.trail.on && !f.timeExit.on && !f.dca.some((d) => d.token.trim());
  const setDca = (i: number, patch: Partial<Form["dca"][number]>) => set({ dca: f.dca.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  const addDca = (token = "") =>
    set({ dca: [...f.dca, { id: `d${Date.now().toString(36).slice(-6)}`, token, usdc: Math.min(1, f.perTradeUsdc), everyHours: 24, totalUsdc: 0, hold: true }] });
  const sm = (patch: Partial<Form["smart"]>) => set({ smart: { ...f.smart, ...patch } });
  const strategySummary = [
    f.dca.some((d) => d.token.trim()) ? `DCA ${f.dca.filter((d) => d.token.trim()).map((d) => (d.token.toLowerCase() === FUCI_TOKEN ? "$FUCI" : `${d.token.slice(0, 6)}…`)).join(", ")}` : null,
    f.smart.on ? `Smart entry ${f.smart.usdc} USDC` : f.snipe.on || f.grad.on ? "Buys on sight" : f.dca.some((d) => d.token.trim()) ? null : "No buys",
    f.tp.on ? `TP +${f.tp.pct}%` : null,
    f.sl.on ? `SL −${f.sl.pct}%` : null,
    f.trail.on ? `trail ${f.trail.pct}%` : null,
    f.timeExit.on ? `exit ${f.timeExit.hours}h` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <details className="rounded-md border border-line bg-surface-2/40 px-4 py-3 text-sm" open={!state.trading}>
        <summary className="cursor-pointer font-semibold">How autopilot works</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">
          {GUIDE.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted">
          Fuci takes {TRADE_FEE_PCT}% per trade. New tokens are risky and can go to zero: only use money you can afford to lose.
        </p>
      </details>

      {/* Always visible: on/off, what it holds and spent, and proof that it is checking. */}
      <div className={`rounded-md border p-4 ${f.enabled ? "border-up/50" : "border-line"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold">
            <span className={`size-2 shrink-0 rounded-full ${f.enabled ? "bg-up" : "bg-line"}`} />
            {f.enabled ? "Autopilot running" : "Autopilot off"}
          </p>
          <div className="flex flex-wrap gap-2">
            {form && (
              <button className="btn btn-ghost !py-2" disabled={busy !== null} onClick={() => save()}>
                Save changes
              </button>
            )}
            <button className={`btn !py-2 ${f.enabled ? "btn-ghost" : "btn-primary"}`} disabled={busy !== null || (!f.enabled && nothingPicked)} onClick={() => save(!f.enabled)}>
              {busy === "save" ? "Saving…" : f.enabled ? "■ Stop" : "▶ Start autopilot"}
            </button>
          </div>
        </div>

        {/* The numbers that matter at a glance: money to trade with, today's buying, what it holds. */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="col-span-2 rounded-md border border-line bg-surface-2/60 p-4 sm:col-span-1">
            <p className="text-xs uppercase tracking-widest text-muted">Balance</p>
            <p className="font-display mt-1 text-4xl font-semibold tabular-nums leading-none">
              {wallet?.walletUsdc == null ? "…" : wallet.walletUsdc.toFixed(2)} <span className="text-base font-normal text-ink-2">USDC</span>
            </p>
            {(wallet?.gatewayUsdc ?? 0) >= 0.01 && (
              <p className="mt-2 text-xs text-ink-2" title="Circle Gateway holds this for the agent's x402 payments (answers and reports). Withdraw everything returns it too.">
                + {wallet!.gatewayUsdc!.toFixed(2)} USDC set aside for paid data
              </p>
            )}
            <button
              type="button"
              className="mt-3 text-sm text-up underline-offset-2 hover:underline"
              onClick={() => {
                const el = document.getElementById("autopilot-wallet") as HTMLDetailsElement | null;
                if (el) {
                  el.open = true;
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            >
              + Add USDC
            </button>
          </div>
          <div className="rounded-md border border-line p-4">
            <p className="text-xs uppercase tracking-widest text-muted">Bought today</p>
            <p className="mt-1 font-mono text-xl tabular-nums">
              {state.spentToday.toFixed(2)} <span className="text-sm text-muted">/ {f.dailyUsdc}</span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${Math.round((state.spentToday / Math.max(f.dailyUsdc, 0.01)) * 100)}% of the daily limit used`}>
              <div className="h-full rounded-full bg-up" style={{ width: `${Math.min(100, (state.spentToday / Math.max(f.dailyUsdc, 0.01)) * 100)}%` }} />
            </div>
          </div>
          <div className="rounded-md border border-line p-4">
            <p className="text-xs uppercase tracking-widest text-muted">Positions</p>
            <p className="mt-1 font-mono text-xl tabular-nums">{state.positions.length}</p>
            <p className="mt-1 text-xs text-ink-2">{state.positions.length ? `worth ${total.toFixed(2)} USDC` : "none open"}</p>
          </div>
        </div>
        {/* What it holds, with Sell right here: no scrolling down to the full table. */}
        {state.positions.length > 0 && (
          <div className="mt-3 rounded-md border border-line">
            <ul className="divide-y divide-line/60">
              {state.positions.slice(0, 5).map((p) => (
                <li key={p.token} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <a className="min-w-0 truncate font-semibold underline-offset-2 hover:underline" href={`https://explorer.arc.io/token/${p.token}`} target="_blank" rel="noreferrer">
                    ${p.symbol}
                  </a>
                  <span className="font-mono text-xs text-ink-2">{p.valueUsdc === null ? "…" : `${p.valueUsdc.toFixed(2)} USDC`}</span>
                  <span className={`font-mono text-xs ${p.pnlPct === null ? "text-muted" : p.pnlPct >= 0 ? "text-up" : "text-danger"}`}>
                    {p.pnlPct === null ? "" : `${p.pnlPct >= 0 ? "+" : ""}${p.pnlPct.toFixed(1)}%`}
                  </span>
                  {p.tradable ? (
                    <button className="btn btn-ghost ml-auto !px-3 !py-1 text-xs" disabled={busy !== null} onClick={() => ops.sellNow(p.token)}>
                      {busy === `sell:${p.token}` ? "Selling…" : "Sell"}
                    </button>
                  ) : (
                    <span className="ml-auto text-xs text-muted">withdraw only</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 border-t border-line/60 px-4 py-2 text-xs">
              <button
                type="button"
                className="text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                onClick={() => {
                  const el = document.getElementById("autopilot-positions") as HTMLDetailsElement | null;
                  if (el) {
                    el.open = true;
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
              >
                {state.positions.length > 5 ? `All ${state.positions.length} positions ↓` : "Details ↓"}
              </button>
              {state.positions.length > 1 && (
                <button className="text-danger underline-offset-2 hover:underline" disabled={busy !== null} onClick={() => ops.sellNow("all")}>
                  {busy === "sell:all" ? "Selling…" : "Sell all"}
                </button>
              )}
            </div>
            {msg("positions")}
          </div>
        )}
        {state.pnl && state.pnl.buys > 0 && <PnlRow pnl={state.pnl} agentId={ops.agentId} />}
        {(state.trading?.pausedReason || (!f.enabled && nothingPicked)) && (
          <p className="mt-2 text-xs text-muted">{state.trading?.pausedReason ? `Note: ${state.trading.pausedReason}` : "Pick at least one rule under Strategy first."}</p>
        )}
        {(f.enabled || state.trading?.lastRunAt) && (
          <AutopilotStatus lastRunAt={state.trading?.lastRunAt} lastResult={state.trading?.lastResult} activity={state.activity ?? []} enabled={f.enabled} />
        )}
        {msg("autopilot")}
      </div>

      <Section id="autopilot-wallet" title="Wallet" summary={wallet?.walletUsdc != null ? `${wallet.walletUsdc.toFixed(2)} USDC` : "Add USDC"} defaultOpen={!wallet || !wallet.walletUsdc}>
        <p className="mt-2 text-sm text-ink-2">Your agent trades with this balance and pays its gas from it.</p>
        {wallet ? (
          <>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-md border border-line px-4 py-3">
              <div>
                <p className="text-xs text-muted">Agent balance</p>
                <p className="font-display text-3xl font-semibold tabular-nums">
                  {wallet.walletUsdc === null ? "…" : wallet.walletUsdc.toFixed(2)} <span className="text-base font-normal text-ink-2">USDC</span>
                </p>
                {(wallet.gatewayUsdc ?? 0) >= 0.01 && (
                  <p className="mt-1 text-xs text-ink-2">
                    + {wallet.gatewayUsdc!.toFixed(2)} USDC in Circle Gateway, for paid answers and reports. Withdraw everything returns it too.
                  </p>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-2 font-mono text-xs text-ink-2">
                <a className="truncate underline" href={wallet.explorer} target="_blank" rel="noreferrer" title={wallet.address}>
                  {wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}
                </a>
                <CopyButton text={wallet.address} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <N value={fund} onChange={setFund} w="w-20" label="USDC to send" />
              <button className="btn btn-primary !py-1.5" disabled={busy !== null || !(fund > 0)} onClick={() => ops.fund(fund)}>
                {busy === "fund" ? "Check your wallet…" : "Add from my wallet"}
              </button>
              <BuyUsdc target={{ agentId: ops.agentId }} label="Buy with card / bank" onSettled={() => void ops.load()} />
            </div>
            <p className="mt-2 text-xs text-muted">
              Or send USDC on Arc to the address above.{" "}
              <button className="underline hover:text-ink" disabled={busy !== null} onClick={ops.withdraw}>
                {busy === "withdraw" ? "Withdrawing…" : "Withdraw everything"}
              </button>{" "}
              back to your wallet anytime.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">Creating the agent wallet…</p>
        )}
        {msg("wallet")}
      </Section>

      <Section title="Strategy" summary={strategySummary} defaultOpen={!state.trading}>
        <p className="mt-2 text-sm text-ink-2">Start from a preset, then tick or untick anything.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => setForm(p.apply(f))} className="rounded-md border border-line p-3 text-left hover:border-ink">
              <span className="font-semibold">{p.label}</span>
              <span className="mt-0.5 block text-xs text-ink-2">{p.body}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted">DCA: buy on a schedule</p>
        <ul className="mt-2 space-y-2">
          {f.dca.map((d, i) => (
            <li key={d.id} className="rounded-md border border-ink/60 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                Buy <N value={d.usdc} step={0.5} label="USDC per DCA buy" onChange={(usdc) => setDca(i, { usdc })} /> USDC of
                <input
                  value={d.token}
                  onChange={(e) => setDca(i, { token: e.target.value.trim() })}
                  placeholder="token contract 0x…"
                  spellCheck={false}
                  aria-label="Token contract"
                  className="field w-44 px-2 py-1 font-mono text-xs sm:w-56"
                />
                every
                <select value={d.everyHours} onChange={(e) => setDca(i, { everyHours: Number(e.target.value) })} className="field px-2 py-1 text-sm" aria-label="How often">
                  {DCA_EVERY.map((h) => (
                    <option key={h} value={h}>
                      {h < 24 ? `${h} h` : h === 24 ? "day" : h === 168 ? "week" : `${h / 24} days`}
                    </option>
                  ))}
                </select>
                <button type="button" className="ml-auto text-xs text-muted hover:text-danger" onClick={() => set({ dca: f.dca.filter((_, k) => k !== i) })} aria-label="Remove DCA plan">
                  ✕
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2">
                <span className="flex items-center gap-1.5">
                  Total budget <N value={d.totalUsdc} w="w-20" label="Total DCA budget" onChange={(totalUsdc) => setDca(i, { totalUsdc })} /> USDC <span className="text-muted">(0 = no cap)</span>
                </span>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={d.hold} onChange={(e) => setDca(i, { hold: e.target.checked })} className="size-4 accent-current" />
                  Keep: never auto-sell this token
                </label>
                {d.token.toLowerCase() === FUCI_TOKEN && <span className="text-up">$FUCI</span>}
              </div>
            </li>
          ))}
        </ul>
        {f.dca.length < MAX_DCA && (
          <div className="mt-2 flex flex-wrap gap-2">
            {!f.dca.some((d) => d.token.toLowerCase() === FUCI_TOKEN) && (
              <button type="button" className="btn btn-primary !py-1.5 text-xs" onClick={() => addDca(FUCI_TOKEN)}>
                + DCA $FUCI
              </button>
            )}
            <button type="button" className="btn btn-ghost !py-1.5 text-xs" onClick={() => addDca()}>
              + DCA another token
            </button>
          </div>
        )}
        <p className="mt-1.5 text-xs text-muted">Each buy counts toward your per-trade and daily limits. With Keep on, take profit, stop loss, trailing and time exits leave this token alone.</p>

        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted">When to buy</p>
        <ul className="mt-2 space-y-2">
          <Row
            on={f.smart.on}
            set={(on) => sm({ on })}
            hint="Watches tokens first and buys only those that pass every check: dev holds little and hasn't sold, no bundled launch, at least one real social, organic volume from many distinct buyers with net inflow, low taxes, no big dump, and a creator who isn't spamming launches. Bonded tokens also need a passing Fuci Risk grade."
          >
            Smart entry: <N value={f.smart.usdc} step={0.5} label="USDC per smart buy" onChange={(usdc) => sm({ usdc })} /> USDC each, on{" "}
            <select value={f.smart.source} onChange={(e) => sm({ source: e.target.value as SmartFilters["source"] })} className="field px-2 py-1 text-sm" aria-label="Which tokens">
              <option value="both">new launches and bondings</option>
              <option value="launches">new launches</option>
              <option value="bonded">bonded tokens</option>
            </select>
          </Row>
          {f.smart.on && (
            <li className="rounded-md border border-line text-sm">
              <details className="group/f px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted">Filters</span>
                <span className="flex min-w-0 items-center gap-2 text-xs text-ink-2">
                  <span className="truncate">
                    dev ≤ {f.smart.maxDevPct}% · bundle ≤ {f.smart.maxBundlePct}% · {f.smart.minSocials}+ social · {f.smart.minBuyers}+ buyers · top wallet ≤ {f.smart.maxTopWalletPct}%
                  </span>
                  <span aria-hidden="true" className="shrink-0 transition group-open/f:rotate-180">▾</span>
                </span>
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["Wait at least", "minAgeMin", "min", 5],
                    ["Give up after", "maxAgeMin", "min", 30],
                    ["Distinct buyers ≥", "minBuyers", "", 1],
                    ["Net buying ≥", "minNetUsdc", "USDC", 10],
                    ["Dev holds ≤", "maxDevPct", "%", 1],
                    ["Buy tax ≤", "maxBuyTaxPct", "%", 0.5],
                    ["Sell tax ≤", "maxSellTaxPct", "%", 0.5],
                    ["Creator launches/day ≤", "maxCreatorLaunches", "", 1],
                    ["Socials (website, X, TG) ≥", "minSocials", "", 1],
                    ["Bundle at launch ≤", "maxBundlePct", "% supply", 0.5],
                    ["Top wallet's volume ≤", "maxTopWalletPct", "%", 5],
                    ["Buy-and-sell wallets ≤", "maxRoundTripPct", "% vol", 5],
                  ] as const
                ).map(([label, k, unit, step]) => (
                  <label key={k} className="flex items-center justify-between gap-2">
                    <span className="text-ink-2">{label}</span>
                    <span className="flex items-center gap-1.5">
                      <N value={f.smart[k]} step={step} w="w-20" label={label} onChange={(v) => sm({ [k]: v } as Partial<Form["smart"]>)} />
                      <span className="w-14 text-xs text-muted">{unit}</span>
                    </span>
                  </label>
                ))}
                <label className="flex items-center justify-between gap-2">
                  <span className="text-ink-2">Bonded: risk grade at least</span>
                  <select value={f.smart.minGrade} onChange={(e) => sm({ minGrade: e.target.value as SmartFilters["minGrade"] })} className="field px-2 py-1 text-sm">
                    {["A", "B", "C", "D"].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
              </div>
              </details>
            </li>
          )}
          <Row on={f.grad.on} set={(on) => set({ grad: { ...f.grad, on } })} hint="Buys every token the moment it bonds, with no other filter. Prefer smart entry.">
            Buy tokens that just bonded, <N value={f.grad.usdc} step={0.5} label="USDC per bonding" onChange={(usdc) => set({ grad: { ...f.grad, usdc } })} /> USDC each
          </Row>
          <Row on={f.snipe.on} set={(on) => set({ snipe: { ...f.snipe, on } })} hint="Buys every new token right after it launches, with no filter. Most are rugs: degen only.">
            Buy new launches, <N value={f.snipe.usdc} step={0.5} label="USDC per new launch" onChange={(usdc) => set({ snipe: { ...f.snipe, usdc } })} /> USDC each
          </Row>
        </ul>
        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted">When to sell</p>
        <ul className="mt-2 space-y-2">
          <Row on={f.tp.on} set={(on) => set({ tp: { ...f.tp, on } })} hint="Locks in gains automatically.">
            Take profit: when up <N value={f.tp.pct} step={10} label="Percent up" onChange={(pct) => set({ tp: { ...f.tp, pct } })} />%, sell{" "}
            <N value={f.tp.sellPct} step={10} label="Percent to sell" onChange={(sellPct) => set({ tp: { ...f.tp, sellPct } })} />%
          </Row>
          <Row on={f.sl.on} set={(on) => set({ sl: { ...f.sl, on } })} hint="Limits the loss if the price falls.">
            Stop loss: when down <N value={f.sl.pct} step={5} label="Percent down" onChange={(pct) => set({ sl: { ...f.sl, pct } })} />%, sell all
          </Row>
          <Row on={f.trail.on} set={(on) => set({ trail: { ...f.trail, on } })} hint="Lets winners run, but sells if the price falls back from its peak (once the position has been in profit).">
            Trailing stop: sell all when the price drops <N value={f.trail.pct} step={5} label="Percent off the peak" onChange={(pct) => set({ trail: { ...f.trail, pct } })} />% from its peak
          </Row>
          <Row on={f.timeExit.on} set={(on) => set({ timeExit: { ...f.timeExit, on } })} hint="Frees money stuck in tokens that go nowhere.">
            Time exit: after <N value={f.timeExit.hours} label="Hours held" onChange={(hours) => set({ timeExit: { ...f.timeExit, hours } })} /> hours, sell if not up{" "}
            <N value={f.timeExit.minGainPct} step={5} label="Minimum gain percent" onChange={(minGainPct) => set({ timeExit: { ...f.timeExit, minGainPct } })} />%
          </Row>
          <Row on={f.dev.on} set={(on) => set({ dev: { on } })} hint="If the token's creator sells, your agent gets out too.">
            Sell when the token&apos;s creator sells
          </Row>
        </ul>

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink-2 hover:text-ink">Advanced: limits and slippage</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
              <span>Max per trade</span>
              <span className="flex items-center gap-1.5">
                <N value={f.perTradeUsdc} step={0.5} label="Max USDC per trade" onChange={(perTradeUsdc) => set({ perTradeUsdc })} /> USDC
              </span>
            </label>
            <label className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
              <span>Max buys per day</span>
              <span className="flex items-center gap-1.5">
                <N value={f.dailyUsdc} label="Max USDC of buys per day" onChange={(dailyUsdc) => set({ dailyUsdc })} /> USDC
              </span>
            </label>
            <label className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
              <span>Slippage</span>
              <span className="flex items-center gap-1.5">
                <N value={f.slippagePct} w="w-14" label="Slippage percent" onChange={(slippagePct) => set({ slippagePct })} />%
              </span>
            </label>
            <label className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
              <span>Skip buy tax above</span>
              <span className="flex items-center gap-1.5">
                <N value={f.maxTax} w="w-14" step={0.5} label="Max buy tax percent" onChange={(maxTax) => set({ maxTax })} />%
              </span>
            </label>
          </div>
          <p className="mt-2 text-xs text-muted">
            Slippage is how much worse than the quoted price a trade may fill. Argus tokens set their own 1–10% buy tax. To trade one token by hand (buy now, limit buy, limit
            sell), paste its address in the box above.
          </p>
        </details>
        {orders.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {orders.map((o) =>
              o.kind === "limit-buy" || o.kind === "limit-sell" ? (
                <span key={o.id} className="flex items-center gap-2 rounded border border-line px-2 py-1 font-mono text-xs">
                  {o.kind === "limit-buy" ? `buy ${o.usdc} USDC` : `sell ${o.pct}%`} {o.token.slice(0, 6)}… {o.kind === "limit-buy" ? "≤" : "≥"} {fmtPrice(o.price)}
                  <button className="text-muted hover:text-danger" disabled={busy !== null} onClick={() => cancel(o.id)} aria-label="Cancel order">
                    ✕
                  </button>
                </span>
              ) : null,
            )}
          </div>
        )}
        {msg("orders")}
        {/* Sticks to the bottom of the screen while the strategy is open, so Start is always one tap away. */}
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 rounded-b-md border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`btn !py-2 ${f.enabled ? "btn-ghost" : "btn-primary"}`}
              disabled={busy !== null || (!f.enabled && nothingPicked)}
              onClick={() => save(!f.enabled)}
            >
              {busy === "save" ? "Saving…" : f.enabled ? "■ Stop" : "▶ Start autopilot"}
            </button>
            <button className={`btn !py-2 ${f.enabled ? "btn-primary" : "btn-ghost"}`} disabled={busy !== null || !form} onClick={() => save()}>
              Save changes
            </button>
            <span className="text-xs text-muted">
              {!f.enabled && nothingPicked ? "Pick a rule or add a DCA token first." : form ? "Unsaved changes." : f.enabled ? "Running. Saved." : "Saved."}
            </span>
          </div>
          {msg("autopilot")}
        </div>
      </Section>


      {state.positions.length > 0 && (
        <Section id="autopilot-positions" title="Positions" summary={`${state.positions.length} · ${total.toFixed(2)} USDC`} defaultOpen>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <button className="btn btn-ghost !py-1.5 text-danger" disabled={busy !== null} onClick={() => ops.sellNow("all")}>
              {busy === "sell:all" ? "Selling…" : "Sell all"}
            </button>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-normal">Token</th>
                <th className="py-1 font-normal">Cost</th>
                <th className="py-1 font-normal">Value</th>
                <th className="py-1 font-normal">PnL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.positions.map((p) => (
                <tr key={p.token} className="border-t border-line/60">
                  <td className="py-2">
                    <a className="font-semibold underline" href={`https://explorer.arc.io/token/${p.token}`} target="_blank" rel="noreferrer">
                      ${p.symbol}
                    </a>
                  </td>
                  <td className="py-2 font-mono">{p.costUsdc.toFixed(2)}</td>
                  <td className="py-2 font-mono">{p.valueUsdc === null ? "…" : p.valueUsdc.toFixed(2)}</td>
                  <td className={`py-2 font-mono ${p.pnlPct === null ? "" : p.pnlPct >= 0 ? "text-up" : "text-danger"}`}>
                    {p.pnlPct === null ? "…" : `${p.pnlPct >= 0 ? "+" : ""}${p.pnlPct.toFixed(1)}%`}
                  </td>
                  <td className="py-2 text-right">
                    {p.tradable ? (
                      <button className="text-xs underline" disabled={busy !== null} onClick={() => ops.sellNow(p.token)}>
                        {busy === `sell:${p.token}` ? "Selling…" : "Sell"}
                      </button>
                    ) : (
                      <span className="text-xs text-muted" title="Not an Argus token: Withdraw all moves it to your wallet">withdraw only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {msg("positions")}
        </Section>
      )}
    </div>
  );
}
