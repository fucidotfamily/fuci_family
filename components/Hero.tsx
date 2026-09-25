"use client";

import Link from "next/link";
import { KelpForest } from "./KelpForest";

type Showcase = { id: string; name: string } | null;

const TRUST = ["Arc mainnet", "USDC", "x402", "Circle Gateway", "ERC-8004"];

export function Hero({ showcase, agentsOnArc, fuciOnChain, trades }: { showcase: Showcase; agentsOnArc: number | null; fuciOnChain: number; trades: number }) {
  // The kelp grows with the number of agents on Arc (read from the registry).
  const fronds = agentsOnArc ? Math.min(60, Math.round(agentsOnArc / 4)) : 0;

  return (
    <section className="relative isolate overflow-hidden border-b border-line" aria-labelledby="hero-title">
      <div aria-hidden="true" className="rings absolute inset-0 -z-20" style={{ maskImage: "radial-gradient(ellipse 55% 65% at 70% 45%, #000 20%, transparent 75%)" }} />
      <KelpForest fronds={fronds} pulse={trades} className="absolute inset-x-0 bottom-0 -z-10 h-[38%] w-full opacity-40" />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-24 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24 lg:pb-32">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="live-dot" /> Live on Arc
          </p>
          <h1 id="hero-title" className="font-display mt-5 text-5xl leading-[1.02] font-bold tracking-tight sm:text-6xl lg:text-7xl">
            AI agents that pay their own way.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-ink-2">
            Spawn an agent in a minute. It gets its own USDC wallet, works on your schedule and pays per call over x402. No API keys, no
            subscriptions.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/spawn" className="btn btn-primary">
              Spawn your agent
            </Link>
            <Link href="/agents" className="btn btn-ghost">
              Browse agents
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-widest text-muted">
            {TRUST.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>

        <div className="relative">
          {showcase ? (
            <Link href={`/agent/${showcase.id}`} className="group block" aria-label={`See ${showcase.name}'s agent card`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated share card from our own route */}
              <img
                src={`/agent/${showcase.id}/opengraph-image`}
                alt={`${showcase.name}: a Fuci agent card`}
                width={1200}
                height={630}
                className="w-full rounded-lg border border-line shadow-2xl shadow-black/40 transition duration-500 group-hover:-translate-y-1 lg:rotate-[-2deg] lg:group-hover:rotate-0"
              />
            </Link>
          ) : (
            <ExampleCard />
          )}
          <p className="mt-4 text-center font-mono text-xs text-muted">
            {agentsOnArc ? `${agentsOnArc.toLocaleString("en-US")} agents on Arc` : "…"}
            {` · ${fuciOnChain} Fuci ${fuciOnChain === 1 ? "agent" : "agents"} on-chain`}
            {trades ? ` · ${trades.toLocaleString("en-US")} autopilot ${trades === 1 ? "trade" : "trades"}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Shown until a real agent exists: what an agent card looks like. */
function ExampleCard() {
  const stats = [
    ["Daily max", "1.00 USDC"],
    ["Runs", "every 1h"],
    ["Paid calls", "128"],
    ["Spent", "0.142 USDC"],
  ];
  return (
    <Link href="/spawn" className="card rings group relative block aspect-[1200/630] w-full overflow-hidden p-5 transition duration-500 hover:-translate-y-1 sm:p-7 lg:rotate-[-2deg] lg:hover:rotate-0">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-bold">fuci</span>
        <span className="rounded border border-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest">Agent on Arc</span>
      </div>
      <div className="mt-4 flex items-center gap-4 sm:mt-6">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-ink bg-surface-2 sm:h-20 sm:w-20">
          <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-10 sm:w-10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 21v-7m0 0c0-3-3-4-4-8m4 8c0-3 3-4 4-8M8 6c-.5-2-2-2.5-2.5-4M8 6c.5-2 1.5-2.5 2-4m6 4c-.5-2-1.5-2.5-2-4m2 4c.5-2 2-2.5 2.5-4" />
          </svg>
        </span>
        <span>
          <span className="block font-mono text-[10px] uppercase tracking-widest text-muted">Your agent card</span>
          <span className="font-display block text-3xl font-bold leading-none sm:text-5xl">your-agent</span>
          <span className="mt-1 block text-sm text-ink-2">Launch Scout · auto</span>
        </span>
      </div>
      <dl className="absolute inset-x-5 bottom-5 grid grid-cols-4 gap-2 border-t border-line pt-3 sm:inset-x-7 sm:bottom-7">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="truncate text-[10px] text-muted sm:text-xs">{k}</dt>
            <dd className="truncate font-mono text-[11px] sm:text-sm">{v}</dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
