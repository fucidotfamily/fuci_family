import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { EXPLORER_URL } from "@/lib/config";
import { refreshForest } from "@/lib/forest";
import { getPublicStats } from "@/lib/publicStats";

export const metadata: Metadata = {
  title: "Stats",
  description: "Fuci in numbers, live from Arc: agents on-chain, x402 payments, autopilot trades, fees, the treasury and $FUCI.",
};

// Live numbers on every visit.
export const dynamic = "force-dynamic";

const usd = (n: number, digits = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const compact = (n: number) => `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
const num = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function ago(ms: number) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

type Row = { label: string; value: string; hint?: ReactNode };

/** One group of numbers: the headline big, the rest as compact rows, so the whole page fits one screen. */
function Group({ title, lead, rows, foot }: { title: string; lead: Row; rows: Row[]; foot?: ReactNode }) {
  return (
    <section className="card flex min-w-0 flex-col p-5">
      <h2 className="eyebrow">{title}</h2>
      <p className="mt-3 text-sm text-muted">{lead.label}</p>
      <p className="font-display mt-1 text-3xl font-semibold tabular-nums break-words">{lead.value}</p>
      {lead.hint && <p className="mt-1 font-mono text-[11px] text-muted">{lead.hint}</p>}
      <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-ink-2">
              {r.label}
              {r.hint && <span className="block font-mono text-[10px] text-muted">{r.hint}</span>}
            </dt>
            <dd className="shrink-0 font-mono tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
      {foot && <p className="mt-auto pt-3 font-mono text-[11px] text-muted">{foot}</p>}
    </section>
  );
}

const price = (n: number) => (n >= 0.01 ? usd(n, 4) : `$${n.toPrecision(3)}`);

const ICON = { agent: "◎", buy: "↗", sell: "↘" } as const;

export default async function StatsPage() {
  const s = await getPublicStats();
  // Keep the factory numbers fresh without making this page wait.
  after(() => refreshForest().catch(() => undefined));
  const m = s.token.market;
  const addr = (a: string) => (
    <a className="underline" href={`${EXPLORER_URL}/address/${a}`} target="_blank" rel="noreferrer">
      {short(a)}
    </a>
  );

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <span className="live-dot" /> Live from Arc
            </p>
            <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Fuci in numbers</h1>
          </div>
          <p className="font-mono text-[11px] text-muted">
            Read from Arc and settled payments, no sample data ·{" "}
            <a className="underline hover:text-ink" href="/api/stats/public">
              JSON
            </a>
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Group
            title="Agents"
            lead={{ label: "Agents on-chain", value: num(s.agents.onChain), hint: "created through the Fuci factory" }}
            rows={[{ label: "All agents on Arc", value: num(s.agents.arcTotal) }]}
            foot={
              <Link className="underline hover:text-ink" href="/agents">
                ERC-8004 registry →
              </Link>
            }
          />
          <Group
            title="Payments & trading"
            lead={{ label: "Paid tool calls", value: num(s.payments.x402Calls), hint: "x402, settled via Circle Gateway" }}
            rows={[
              { label: "USDC settled", value: s.payments.usdcSettled === null ? "—" : usd(s.payments.usdcSettled, 4) },
              { label: "Autopilot trades", value: num(s.trading.trades) },
              { label: "Launches scanned", value: num(s.payments.launchesScanned) },
            ]}
          />
          <Group
            title="Revenue"
            lead={{ label: "Total fees", value: usd(s.revenue.totalUsdc), hint: "1 USDC per agent + 1% per trade" }}
            rows={[
              { label: "Creation fees", value: usd(s.revenue.creationFeesUsdc) },
              { label: "Trade fees", value: usd(s.revenue.tradeFeesUsdc) },
              { label: "Treasury", value: s.revenue.treasuryUsdc === null ? "—" : usd(s.revenue.treasuryUsdc), hint: <>Safe · {addr(s.revenue.treasury)}</> },
            ]}
            foot={
              <a className="underline hover:text-ink" href="https://defillama.com/protocol/fuci" target="_blank" rel="noreferrer">
                Tracked on DefiLlama ↗
              </a>
            }
          />
          <Group
            title="$FUCI"
            lead={{ label: "Market cap", value: m ? compact(m.marketCapUsd) : "—", hint: `${compact(s.token.supply).slice(1)} supply · ${s.token.buyTaxPct}%/${s.token.sellTaxPct}% tax to holders` }}
            rows={[
              { label: "Price", value: m ? price(m.priceUsd) : "—" },
              { label: "Liquidity", value: m ? compact(m.liquidityUsd) : "—", hint: m ? `Uniswap v4 · ${m.pairs} ${m.pairs === 1 ? "pool" : "pools"}` : undefined },
              { label: "24h volume", value: m ? compact(m.volume24hUsd) : "—", hint: m ? `${m.txns24h.toLocaleString("en-US")} trades` : undefined },
            ]}
            foot={
              m ? (
                <a className="underline hover:text-ink" href={m.url} target="_blank" rel="noreferrer">
                  DexScreener ↗
                </a>
              ) : undefined
            }
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="card min-w-0 p-5">
            <h2 className="eyebrow">Latest on-chain activity</h2>
            <ul className="mt-3 max-h-64 divide-y divide-line/60 overflow-y-auto">
              {s.recent.length === 0 && <li className="py-2 text-sm text-muted">Nothing yet.</li>}
              {s.recent.map((e) => (
                <li key={e.href + e.at} className="flex items-center gap-3 py-2 text-sm">
                  <span className={e.kind === "sell" ? "text-danger" : "text-up"}>{ICON[e.kind]}</span>
                  <a href={e.href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                    {e.label}
                  </a>
                  <span className="shrink-0 font-mono text-[11px] text-muted">{ago(e.at)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card min-w-0 p-5">
            <h2 className="eyebrow">Contracts</h2>
            <ul className="mt-3 divide-y divide-line/60">
              {s.contracts.map((c) => (
                <li key={c.label} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 text-ink-2">{c.label}</span>
                  <a href={`${EXPLORER_URL}/address/${c.address}`} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">
                    {short(c.address)}
                  </a>
                  <CopyButton text={c.address} />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {s.links.map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink">
                  {l.label} ↗
                </a>
              ))}
            </div>
          </section>
        </div>

        <p className="mt-4 font-mono text-[11px] text-muted">Updated {new Date(s.asOf).toUTCString()}. Not financial advice.</p>
      </div>
    </main>
  );
}
