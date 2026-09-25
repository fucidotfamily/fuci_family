"use client";

import { useEffect, useState } from "react";
import type { TradingOps } from "./useTrading";
import type { TradeRule } from "@/lib/tradingRules";

type Token = {
  token: string;
  symbol: string;
  price: number;
  bonded: boolean;
  progressPct: number;
  buyTaxPct: number;
  sellTaxPct: number;
  creator: string;
  argusUrl: string;
};

export const fmtPrice = (p: number | null | undefined) => (p === null || p === undefined ? "…" : p === 0 ? "0" : p >= 1 ? p.toFixed(4) : p.toPrecision(3));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const newId = () => Math.random().toString(36).slice(2, 8);

/** A pasted Argus token: what it is, and (for the owner) buy now, limit buy, limit sell, sell. */
export function TokenCard({ address, ops }: { address: string; ops: TradingOps | null }) {
  const [info, setInfo] = useState<Token | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buyAmt, setBuyAmt] = useState(1);
  const [lbPrice, setLbPrice] = useState("");
  const [lbAmt, setLbAmt] = useState(1);
  const [lsPrice, setLsPrice] = useState("");
  const [lsPct, setLsPct] = useState(100);

  useEffect(() => {
    let live = true;
    fetch(`/api/token/${address}`)
      .then(async (r) => {
        const body = await r.json();
        if (!live) return;
        if (!r.ok) throw new Error(body.error ?? "Could not read this token");
        setInfo(body);
        setError(null);
        // Start the limit prices 20% below / 100% above the current price.
        setLbPrice(Number((body.price * 0.8).toPrecision(3)).toString());
        setLsPrice(Number((body.price * 2).toPrecision(3)).toString());
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [address]);

  if (error) return <p className="mt-4 text-sm text-danger">{error}</p>;
  if (!info) return <p className="mt-4 text-sm text-muted">Reading the token on Arc…</p>;

  const held = ops?.state?.positions.find((p) => p.token.toLowerCase() === info.token.toLowerCase());
  const busy = ops?.busy ?? null;
  const msg = ops?.msg?.where === "token" ? ops.msg : null;
  const orders = (ops?.state?.trading?.rules ?? []).filter((r): r is Extract<TradeRule, { kind: "limit-buy" | "limit-sell" }> => (r.kind === "limit-buy" || r.kind === "limit-sell") && r.token === info.token.toLowerCase() && !r.done);

  return (
    <div className="mt-4 rounded-lg border border-line p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-2xl font-semibold">${info.symbol}</p>
        <p className="font-mono text-lg">
          {fmtPrice(info.price)} <span className="text-xs text-muted">USDC</span>
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        {info.bonded ? "Bonded" : `${info.progressPct.toFixed(info.progressPct < 10 ? 1 : 0)}% to bonding`} · tax {info.buyTaxPct}% buy / {info.sellTaxPct}% sell
        {" · "}
        <a className="font-mono text-xs underline" href={`https://explorer.arc.io/address/${info.creator}`} target="_blank" rel="noreferrer">
          dev {short(info.creator)}
        </a>
        {" · "}
        <a className="text-xs underline" href={info.argusUrl} target="_blank" rel="noreferrer">
          Argus ↗
        </a>
      </p>
      {!info.bonded && (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-surface-2" aria-hidden>
          <div className="h-full bg-ink" style={{ width: `${Math.max(2, info.progressPct)}%` }} />
        </div>
      )}
      {held && (
        <p className="mt-2 text-sm">
          You hold <b className="font-mono">{held.valueUsdc?.toFixed(2) ?? "…"} USDC</b>{" "}
          {held.pnlPct !== null && <span className={held.pnlPct >= 0 ? "text-up" : "text-danger"}>({held.pnlPct >= 0 ? "+" : ""}{held.pnlPct.toFixed(1)}%)</span>}
        </p>
      )}

      {!ops ? (
        <p className="mt-4 text-xs text-muted">Only this agent&apos;s owner can trade. Connect the wallet that spawned it.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded border border-line p-3">
            <p className="text-sm font-semibold">Buy now</p>
            <p className="text-xs text-muted">Buys right away from the agent wallet.</p>
            <div className="mt-2 flex items-center gap-2">
              <input type="number" min={0.1} step={0.5} value={buyAmt} onChange={(e) => setBuyAmt(Number(e.target.value))} className="w-20 field px-2 py-1.5 font-mono text-sm" aria-label="USDC to spend" />
              <span className="text-xs text-muted">USDC</span>
              <button className="btn btn-primary ml-auto !px-3 !py-1.5" disabled={busy !== null || !(buyAmt > 0)} onClick={() => ops.buyNow(info.token, buyAmt)}>
                {busy === `buy:${info.token}` ? "…" : "Buy"}
              </button>
            </div>
          </div>
          <div className="rounded border border-line p-3">
            <p className="text-sm font-semibold">Limit buy</p>
            <p className="text-xs text-muted">Buys once the price drops to:</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={lbPrice} onChange={(e) => setLbPrice(e.target.value)} className="w-28 min-w-0 flex-1 field px-2 py-1.5 font-mono text-sm" aria-label="Buy at or below this price" />
              <input type="number" min={0.1} step={0.5} value={lbAmt} onChange={(e) => setLbAmt(Number(e.target.value))} className="w-16 field px-2 py-1.5 font-mono text-sm" aria-label="USDC to spend" />
              <button
                className="btn btn-ghost !px-3 !py-1.5"
                disabled={busy !== null || !(Number(lbPrice) > 0)}
                onClick={() => ops.addOrder({ id: newId(), kind: "limit-buy", token: info.token.toLowerCase(), price: Number(lbPrice), usdc: lbAmt })}
              >
                Place
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">price · USDC to spend</p>
          </div>
          <div className="rounded border border-line p-3">
            <p className="text-sm font-semibold">Limit sell</p>
            <p className="text-xs text-muted">Sells once the price reaches:</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={lsPrice} onChange={(e) => setLsPrice(e.target.value)} className="w-28 min-w-0 flex-1 field px-2 py-1.5 font-mono text-sm" aria-label="Sell at or above this price" />
              <input type="number" min={1} max={100} step={10} value={lsPct} onChange={(e) => setLsPct(Number(e.target.value))} className="w-16 field px-2 py-1.5 font-mono text-sm" aria-label="Percent to sell" />
              <button
                className="btn btn-ghost !px-3 !py-1.5"
                disabled={busy !== null || !(Number(lsPrice) > 0)}
                onClick={() => ops.addOrder({ id: newId(), kind: "limit-sell", token: info.token.toLowerCase(), price: Number(lsPrice), pct: lsPct })}
              >
                Place
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">{held ? "price · % of the position" : "price · % (fires once the agent holds it)"}</p>
          </div>
        </div>
      )}

      {ops && (orders.length > 0 || held) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          {orders.map((o) => (
            <span key={o.id} className="rounded border border-line px-2 py-1 font-mono">
              {o.kind === "limit-buy" ? `buy ≤ ${fmtPrice(o.price)}` : `sell ≥ ${fmtPrice(o.price)}`}
            </span>
          ))}
          {held && (
            <button className="btn btn-ghost !py-1 text-danger" disabled={busy !== null} onClick={() => ops.sellNow(info.token, 100, "token")}>
              {busy === `sell:${info.token}` ? "Selling…" : `Sell all $${info.symbol}`}
            </button>
          )}
        </div>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-up" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
