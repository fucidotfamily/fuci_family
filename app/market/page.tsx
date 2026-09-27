import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { ListYourApi, MarketBrowser } from "@/components/MarketBrowser";
import { getMarket, rebuildMarket } from "@/lib/market";
import { requestOrigin } from "@/lib/requestOrigin";

export const metadata: Metadata = {
  title: { absolute: "Fuci Market" },
  description: "Every paid API an AI agent can buy with USDC on Arc, over x402. Each one checked live. Free to search for people and agents.",
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ago = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export default async function MarketPage() {
  const origin = await requestOrigin();
  let { market, stale } = await getMarket();
  if (!market) {
    market = await rebuildMarket(origin).catch(() => null);
    stale = false;
  }
  if (stale) after(() => rebuildMarket(origin).catch(() => undefined));
  const listings = market?.listings ?? [];
  const cheapest = listings.length ? Math.min(...listings.map((l) => l.priceUsdc)) : null;

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="eyebrow flex items-center gap-2">
          <span className="live-dot" /> x402 on Arc
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Fuci Market</h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          Every paid API an AI agent can buy with USDC on Arc, from every seller we can find. Each one is checked live: it must answer{" "}
          <code className="font-mono text-sm">402 Payment Required</code> with an Arc price before it shows here. No accounts, no API keys: pay per call.
        </p>

        <dl className="mt-8 grid grid-cols-3 gap-3">
          <div className="card p-4 sm:p-5">
            <dt className="text-sm text-muted">Paid APIs</dt>
            <dd className="font-display mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{listings.length}</dd>
          </div>
          <div className="card p-4 sm:p-5">
            <dt className="text-sm text-muted">Sellers</dt>
            <dd className="font-display mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{market?.sellers ?? 0}</dd>
          </div>
          <div className="card p-4 sm:p-5">
            <dt className="text-sm text-muted">From</dt>
            <dd className="font-display mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{cheapest === null ? "—" : `$${cheapest < 0.01 ? cheapest.toPrecision(1) : cheapest.toFixed(2)}`}</dd>
          </div>
        </dl>

        <div className="mt-10">
          <MarketBrowser listings={listings} />
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <section className="card p-5 sm:p-6">
            <h2 className="font-display text-2xl font-semibold tracking-tight">For agents</h2>
            <p className="mt-2 text-sm text-ink-2">Search the market for free, then pay any listing with an x402 client (for example @x402/fetch or Circle Gateway).</p>
            <ul className="mt-4 space-y-2 font-mono text-xs text-ink-2">
              <li>
                HTTP: <a className="text-ink underline" href="/api/market?q=search">GET /api/market?q=search</a>
              </li>
              <li>
                MCP: <Link className="text-ink underline" href="/docs#mcp">/api/mcp</Link> → tool <span className="text-ink">market_search</span>
              </li>
            </ul>
          </section>
          <section className="card p-5 sm:p-6">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Sell your API</h2>
            <p className="mt-2 text-sm text-ink-2">
              Paste an endpoint that answers 402 with a USDC price on Arc. We check it right now; if it is live, it is listed. Registered ERC-8004 agents with an x402
              service are picked up on their own.
            </p>
            <ListYourApi />
          </section>
        </div>

        <p className="mt-12 font-mono text-[11px] text-muted">
          {market ? `Checked ${ago(market.builtAt)}. ` : ""}Sources: Fuci tools, ERC-8004 agents on Arc, Coinbase&apos;s public x402 catalogue and seller submissions. Listing is not an
          endorsement: check what you buy.
        </p>
      </div>
    </main>
  );
}
