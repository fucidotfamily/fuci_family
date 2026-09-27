"use client";

import { useState } from "react";
import { CopyButton } from "./CopyButton";
import { BuyUsdc } from "./BuyUsdc";
import { fmtPrice } from "./TokenCard";
import type { TradingOps } from "./useTrading";
import { DEFAULT_MAX_BUY_TAX_PCT, TRADE_FEE_PCT, type TradeRule, type TradingSettings } from "@/lib/tradingRules";

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
};

function toForm(s: TradingSettings, fresh: boolean): Form {
  const find = <K extends TradeRule["kind"]>(k: K) => s.rules.find((r) => r.kind === k) as Extract<TradeRule, { kind: K }> | undefined;
  const snipe = find("snipe-new");
  const grad = find("buy-graduated");
  const tp = find("take-profit");
  const sl = find("stop-loss");
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
  };
}

/** `orders` are the limit orders placed from token cards; they are kept as they are. */
function toSettings(f: Form, orders: TradeRule[], enabled = f.enabled): TradingSettings {
  const rules: TradeRule[] = [];
  if (f.snipe.on) rules.push({ id: "snipe", kind: "snipe-new", usdc: f.snipe.usdc, maxBuyTaxPct: f.maxTax });
  if (f.grad.on) rules.push({ id: "grad", kind: "buy-graduated", usdc: f.grad.usdc, maxBuyTaxPct: f.maxTax });
  if (f.tp.on) rules.push({ id: "tp", kind: "take-profit", pct: f.tp.pct, sellPct: f.tp.sellPct });
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

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1.75rem_1fr] gap-3 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <span className="flex size-7 items-center justify-center rounded-full border border-ink font-mono text-xs">{n}</span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {hint && <p className="mt-0.5 text-sm text-ink-2">{hint}</p>}
        {children}
      </div>
    </div>
  );
}

/** One-tap starting points; every value stays editable below. */
const PRESETS: { id: string; label: string; body: string; apply: (f: Form) => Form }[] = [
  {
    id: "careful",
    label: "Careful",
    body: "Only buys tokens that already bonded. Small amounts, quick exits.",
    apply: (f) => ({
      ...f,
      snipe: { ...f.snipe, on: false },
      grad: { on: true, usdc: 1 },
      tp: { on: true, pct: 50, sellPct: 50 },
      sl: { on: true, pct: 30 },
      dev: { on: true },
      perTradeUsdc: 1,
      dailyUsdc: 5,
    }),
  },
  {
    id: "bold",
    label: "Bold",
    body: "Also buys brand-new launches. Higher risk, higher reward.",
    apply: (f) => ({
      ...f,
      snipe: { on: true, usdc: 1 },
      grad: { on: true, usdc: 1 },
      tp: { on: true, pct: 100, sellPct: 50 },
      sl: { on: true, pct: 50 },
      dev: { on: true },
      perTradeUsdc: 2,
      dailyUsdc: 10,
    }),
  },
];

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
  const nothingPicked = !f.snipe.on && !f.grad.on && !f.tp.on && !f.sl.on && !f.dev.on;

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

      <Step n={1} title="Add USDC" hint="Your agent trades with this balance and pays its gas from it.">
        {wallet ? (
          <>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-md border border-line px-4 py-3">
              <div>
                <p className="text-xs text-muted">Agent balance</p>
                <p className="font-display text-3xl font-semibold tabular-nums">
                  {wallet.walletUsdc === null ? "…" : wallet.walletUsdc.toFixed(2)} <span className="text-base font-normal text-ink-2">USDC</span>
                </p>
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
      </Step>

      <Step n={2} title="Choose a strategy" hint="Start from a preset, then tick or untick anything.">
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => setForm(p.apply(f))} className="rounded-md border border-line p-3 text-left hover:border-ink">
              <span className="font-semibold">{p.label}</span>
              <span className="mt-0.5 block text-xs text-ink-2">{p.body}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted">When to buy</p>
        <ul className="mt-2 space-y-2">
          <Row on={f.grad.on} set={(on) => set({ grad: { ...f.grad, on } })} hint="A token bonds when enough people buy it. Safer than brand-new launches.">
            Buy tokens that just bonded, <N value={f.grad.usdc} step={0.5} label="USDC per bonding" onChange={(usdc) => set({ grad: { ...f.grad, usdc } })} /> USDC each
          </Row>
          <Row on={f.snipe.on} set={(on) => set({ snipe: { ...f.snipe, on } })} hint="Buys every new token right after it launches on Argus. Riskiest, biggest upside.">
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
      </Step>

      <Step n={3} title="Turn it on">
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className={`btn !py-2.5 ${f.enabled ? "btn-ghost" : "btn-primary"}`}
            disabled={busy !== null || (!f.enabled && nothingPicked)}
            onClick={() => save(!f.enabled)}
          >
            {busy === "save" ? "Saving…" : f.enabled ? "■ Stop autopilot" : "▶ Start autopilot"}
          </button>
          {form && (
            <button className="btn btn-ghost !py-2.5" disabled={busy !== null} onClick={() => save()}>
              Save changes
            </button>
          )}
          <span className={`flex items-center gap-2 font-mono text-xs ${f.enabled ? "text-up" : "text-muted"}`}>
            <span className={`size-2 rounded-full ${f.enabled ? "bg-up" : "bg-line"}`} />
            {f.enabled ? "Running" : "Off"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          {state.trading?.pausedReason
            ? `Note: ${state.trading.pausedReason}`
            : nothingPicked
              ? "Pick at least one rule in step 2 first."
              : `Checks every 5 minutes · bought today ${state.spentToday.toFixed(2)} of ${f.dailyUsdc} USDC.`}
        </p>
        {msg("autopilot")}
      </Step>

      {state.positions.length > 0 && (
        <div className="border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              Positions <span className="font-mono text-xs font-normal text-ink-2">· {total.toFixed(2)} USDC</span>
            </p>
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
        </div>
      )}
    </div>
  );
}
