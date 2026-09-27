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

function Tile({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="card min-w-0 p-4 sm:p-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-display mt-2 text-2xl font-semibold tabular-nums break-words sm:text-3xl">{value}</dd>
      {hint && <dd className="mt-1 font-mono text-[11px] text-muted">{hint}</dd>}
    </div>
  );
}

function Section({ title, sub, cols = 4, children }: { title: string; sub: string; cols?: 2 | 4; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-ink-2">{sub}</p>
      <dl className={`mt-4 grid grid-cols-2 gap-3 ${cols === 4 ? "lg:grid-cols-4" : ""}`}>{children}</dl>
    </section>
  );
}

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
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="eyebrow flex items-center gap-2">
          <span className="live-dot" /> Live from Arc
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Fuci in numbers</h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          Every number here is read from Arc or from settled USDC payments, and links to where you can check it. No sample data. The same numbers
          are available as JSON at{" "}
          <a className="text-ink underline" href="/api/stats/public">
            /api/stats/public
          </a>
          .
        </p>

        <Section title="Agents" sub="AI agents with their own wallet and an ERC-8004 identity on Arc." cols={2}>
          <Tile label="Agents on-chain" value={num(s.agents.onChain)} hint={<>created through the Fuci factory</>} />
          <Tile
            label="All agents on Arc"
            value={num(s.agents.arcTotal)}
            hint={
              <Link className="underline" href="/agents">
                ERC-8004 registry →
              </Link>
            }
          />
        </Section>

        <Section title="Payments and trading" sub="Paid x402 tool calls settled in USDC, and trades made from agent wallets.">
          <Tile label="Paid tool calls" value={num(s.payments.x402Calls)} hint="x402, settled via Circle Gateway" />
          <Tile label="USDC settled" value={s.payments.usdcSettled === null ? "—" : usd(s.payments.usdcSettled, 4)} hint="nanopayments" />
          <Tile label="Autopilot trades" value={num(s.trading.trades)} hint="filled on Argus pools" />
          <Tile label="Launches scanned" value={num(s.payments.launchesScanned)} hint="Argus launches read by agents" />
        </Section>

        <Section title="Revenue" sub="What Fuci earns: the 1 USDC creation fee and 1% of each autopilot trade, paid to the treasury.">
          <Tile label="Total fees" value={usd(s.revenue.totalUsdc)} hint={<a className="underline" href="https://defillama.com/protocol/fuci" target="_blank" rel="noreferrer">tracked on DefiLlama</a>} />
          <Tile label="Creation fees" value={usd(s.revenue.creationFeesUsdc)} hint="1 USDC per agent" />
          <Tile label="Trade fees" value={usd(s.revenue.tradeFeesUsdc)} hint="1% per autopilot trade" />
          <Tile label="Treasury balance" value={s.revenue.treasuryUsdc === null ? "—" : usd(s.revenue.treasuryUsdc)} hint={<>Safe multisig · {addr(s.revenue.treasury)}</>} />
        </Section>

        <Section title="$FUCI" sub={`${s.token.buyTaxPct}% buy / ${s.token.sellTaxPct}% sell tax, paid back to holders in USDC. Market data from DexScreener.`}>
          <Tile label="Price" value={m ? usd(m.priceUsd * 1e6) : "—"} hint="per 1M $FUCI" />
          <Tile label="Market cap" value={m ? compact(m.marketCapUsd) : "—"} hint={`${compact(s.token.supply).slice(1)} supply`} />
          <Tile label="Liquidity" value={m ? compact(m.liquidityUsd) : "—"} hint={m ? `Uniswap v4 · ${m.pairs} ${m.pairs === 1 ? "pool" : "pools"}` : "Uniswap v4"} />
          <Tile
            label="24h volume"
            value={m ? compact(m.volume24hUsd) : "—"}
            hint={
              m ? (
                <a className="underline" href={m.url} target="_blank" rel="noreferrer">
                  {m.txns24h.toLocaleString("en-US")} trades · DexScreener ↗
                </a>
              ) : (
                "DexScreener"
              )
            }
          />
        </Section>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Latest on-chain activity</h2>
            <ul className="card mt-4 divide-y divide-line">
              {s.recent.length === 0 && <li className="p-4 text-sm text-muted">Nothing yet.</li>}
              {s.recent.map((e) => (
                <li key={e.href + e.at} className="flex items-center gap-3 p-4 text-sm">
                  <span className={e.kind === "sell" ? "text-danger" : "text-up"}>{ICON[e.kind]}</span>
                  <a href={e.href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                    {e.label}
                  </a>
                  <span className="shrink-0 font-mono text-[11px] text-muted">{ago(e.at)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Contracts</h2>
            <ul className="card mt-4 divide-y divide-line">
              {s.contracts.map((c) => (
                <li key={c.label} className="flex flex-wrap items-center gap-2 p-4 text-sm">
                  <span className="min-w-0 flex-1 text-ink-2">{c.label}</span>
                  <a href={`${EXPLORER_URL}/address/${c.address}`} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">
                    {short(c.address)}
                  </a>
                  <CopyButton text={c.address} />
                </li>
              ))}
            </ul>
            <h2 className="font-display mt-8 text-2xl font-semibold tracking-tight">Find Fuci on</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {s.links.map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="btn btn-ghost !py-1.5">
                  {l.label} ↗
                </a>
              ))}
            </div>
          </section>
        </div>

        <p className="mt-12 font-mono text-[11px] text-muted">Updated {new Date(s.asOf).toUTCString()}. Not financial advice.</p>
      </div>
    </main>
  );
}
