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

function Row({ on, set, children }: { on: boolean; set: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <li className={`flex items-start gap-3 rounded border px-3 py-2 text-sm ${on ? "border-ink/60" : "border-line text-ink-2"}`}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-1.5 size-4 shrink-0 accent-current" />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">{children}</span>
    </li>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1.75rem_1fr] gap-3 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <span className="flex size-7 items-center justify-center rounded-full border border-ink font-mono text-xs">{n}</span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

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

  return (
    <div className="space-y-5">
      <Step n={1} title="Fund the agent wallet">
        {wallet ? (
          <>
            <p className="mt-1 text-sm text-ink-2">Send USDC on Arc to this address, use Fund below, or buy USDC with a card, Apple Pay or Google Pay. It pays for trades and gas. Only you can withdraw, anytime: USDC and tokens go back to your wallet.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-line px-3 py-2">
              <a className="min-w-0 break-all font-mono text-sm underline" href={wallet.explorer} target="_blank" rel="noreferrer">
                {wallet.address}
              </a>
              <CopyButton text={wallet.address} />
              <span className="ml-auto font-mono text-sm">{wallet.walletUsdc === null ? "…" : wallet.walletUsdc.toFixed(2)} USDC</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <N value={fund} onChange={setFund} w="w-20" label="USDC to send" />
              <button className="btn btn-ghost !py-1.5" disabled={busy !== null || !(fund > 0)} onClick={() => ops.fund(fund)}>
                {busy === "fund" ? "Check your wallet…" : "Fund"}
              </button>
              <button className="btn btn-ghost !py-1.5" disabled={busy !== null} onClick={ops.withdraw}>
                {busy === "withdraw" ? "Withdrawing…" : "Withdraw all"}
              </button>
              <BuyUsdc target={{ agentId: ops.agentId }} onSettled={() => void ops.load()} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">Creating the agent wallet…</p>
        )}
        {wallet && <p className="mt-2 text-xs text-muted">Buys stop at your daily max ({f.dailyUsdc} USDC a day, set in step 2), whatever the balance.</p>}
        {msg("wallet")}
      </Step>

      <Step n={2} title="Pick what it does">
        <ul className="mt-2 space-y-2">
          <Row on={f.snipe.on} set={(on) => set({ snipe: { ...f.snipe, on } })}>
            Buy every new Argus launch, spend <N value={f.snipe.usdc} step={0.5} label="USDC per new launch" onChange={(usdc) => set({ snipe: { ...f.snipe, usdc } })} /> USDC
          </Row>
          <Row on={f.grad.on} set={(on) => set({ grad: { ...f.grad, on } })}>
            Buy when a token bonds, spend <N value={f.grad.usdc} step={0.5} label="USDC per bonding" onChange={(usdc) => set({ grad: { ...f.grad, usdc } })} /> USDC
          </Row>
          {(f.snipe.on || f.grad.on) && (
            <li className="flex flex-wrap items-center gap-1.5 px-3 text-xs text-ink-2">
              Skip tokens with a buy tax above <N value={f.maxTax} w="w-14" step={0.5} label="Max buy tax percent" onChange={(maxTax) => set({ maxTax })} />% (Argus tokens set their own
              1–10% tax)
            </li>
          )}
          <Row on={f.tp.on} set={(on) => set({ tp: { ...f.tp, on } })}>
            Take profit: when up <N value={f.tp.pct} step={10} label="Percent up" onChange={(pct) => set({ tp: { ...f.tp, pct } })} />%, sell{" "}
            <N value={f.tp.sellPct} step={10} label="Percent to sell" onChange={(sellPct) => set({ tp: { ...f.tp, sellPct } })} />%
          </Row>
          <Row on={f.sl.on} set={(on) => set({ sl: { ...f.sl, on } })}>
            Stop loss: when down <N value={f.sl.pct} step={5} label="Percent down" onChange={(pct) => set({ sl: { ...f.sl, pct } })} />%, sell all
          </Row>
          <Row on={f.dev.on} set={(on) => set({ dev: { on } })}>
            Sell all when the token&apos;s dev sells
          </Row>
        </ul>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          Limits: <N value={f.perTradeUsdc} step={0.5} label="Max USDC per trade" onChange={(perTradeUsdc) => set({ perTradeUsdc })} /> USDC per trade ·{" "}
          <N value={f.dailyUsdc} label="Max USDC of buys per day" onChange={(dailyUsdc) => set({ dailyUsdc })} /> USDC per day · slippage{" "}
          <N value={f.slippagePct} w="w-14" label="Slippage percent" onChange={(slippagePct) => set({ slippagePct })} />%
        </p>
        <p className="mt-1 text-xs text-muted">To trade one token (buy now, limit buy, limit sell), paste its address in the box above.</p>
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className={`tab ${f.enabled ? "tab-active" : ""}`} aria-pressed={f.enabled} disabled={busy !== null} onClick={() => save(!f.enabled)}>
            {busy === "save" ? "…" : f.enabled ? "On" : "Off"}
          </button>
          <button className="btn btn-primary !py-2" disabled={busy !== null} onClick={() => save()}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {state.trading?.pausedReason
            ? `Note: ${state.trading.pausedReason}`
            : `Checks every 5 minutes · bought today ${state.spentToday.toFixed(2)}/${f.dailyUsdc} USDC · ${TRADE_FEE_PCT}% fee per trade · memecoins can go to zero.`}
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
