import Link from "next/link";
import type { ReactNode } from "react";
import type { Forest } from "@/lib/forest";
import type { IndexedAgent } from "@/lib/agentQuery";
import { EXPLORER_URL } from "@/lib/config";
import { ERC8004 } from "@/lib/erc8004Abi";

const clock = () => Date.now();

function ago(ms: number, now: number) {
  const s = Math.max(1, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const ICON = { agent: "◎", buy: "↗", sell: "↘" } as const;

/** Where a Fuci agent in the registry links: its Fuci page, or its ERC-8004 token on the explorer. */
function agentHref(a: IndexedAgent) {
  const id = a.url ? /\/api\/agent\/([^/]+)\/card$/.exec(a.url)?.[1] : null;
  return id ? `/agent/${id}` : `${EXPLORER_URL}/token/${ERC8004.identity}/instance/${a.agentId}`;
}

/** What Fuci agents did on Arc: the agent registry, the Fuci factory and agent-wallet trades. */
export function TideStats({
  forest,
  fuciAgents,
  treasury,
}: {
  forest: Forest;
  fuciAgents: IndexedAgent[];
  treasury: { address: string; usdc: number } | null;
}) {
  const now = clock();
  const fees = forest.creationFeesUsdc + forest.tradeFeesUsdc;
  const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const tiles: { label: string; value: string; hint: ReactNode }[] = [
    { label: "Agents on-chain", value: forest.agentsCreated.toLocaleString("en-US"), hint: "created via the Fuci factory" },
    { label: "Fees earned", value: usd(fees), hint: `creation + ${forest.trades} autopilot ${forest.trades === 1 ? "trade" : "trades"}` },
    {
      label: "Fuci treasury",
      value: treasury ? usd(treasury.usdc) : "…",
      hint: treasury ? (
        <a className="underline" href={`${EXPLORER_URL}/address/${treasury.address}`} target="_blank" rel="noreferrer">
          Safe multisig · {treasury.address.slice(0, 6)}…{treasury.address.slice(-4)}
        </a>
      ) : (
        "USDC on Arc"
      ),
    },
  ];
  const events = forest.events;

  return (
    <section id="forest" className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="forest-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="live-dot" /> Live from Arc
          </p>
          <h2 id="forest-title" className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            The forest right now.
          </h2>
        </div>
        <Link href="/agents" className="text-sm text-ink underline underline-offset-2">
          All agents on Arc →
        </Link>
      </div>

      <dl className="mt-8 grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="card reveal p-5">
            <dt className="text-sm text-muted">{t.label}</dt>
            <dd className="font-display mt-2 text-3xl font-semibold tabular-nums sm:text-4xl">{t.value}</dd>
            <dd className="mt-1 font-mono text-[11px] text-muted">{t.hint}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="card reveal p-5">
          <h3 className="font-display text-lg font-semibold">Fuci agents on Arc</h3>
          {fuciAgents.length ? (
            <ol className="mt-3 divide-y divide-line/60">
              {fuciAgents.slice(0, 5).map((a, i) => (
                <li key={a.agentId}>
                  <a href={agentHref(a)} className="flex items-center gap-3 py-2.5 hover:text-ink">
                    {a.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- image from the agent's registration file
                      <img src={a.image} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 rounded-full border border-line object-cover" />
                    ) : (
                      <span className="h-8 w-8 rounded-full border border-line" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.name ?? "Unnamed agent"}</span>
                      <span className="block font-mono text-xs text-muted">
                        ERC-8004 #{a.agentId}
                        {a.x402 ? " · x402" : ""}
                      </span>
                    </span>
                    <span className="text-right font-mono text-xs text-ink-2">
                      #{i + 1}
                      {a.reputation?.count ? <span className="block text-muted">★ {a.reputation.score?.toFixed(0)} · {a.reputation.count}</span> : null}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-ink-2">None yet. Spawn an agent and create it on-chain (1 USDC).</p>
          )}
        </div>

        <div className="card reveal p-5">
          <h3 className="font-display text-lg font-semibold">Agent activity on-chain</h3>
          {events.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {events.slice(0, 7).map((e, i) => (
                <li key={i}>
                  <a href={e.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-ink-2 hover:text-ink">
                    <span className="w-4 shrink-0 text-center font-mono text-xs text-muted">{ICON[e.kind]}</span>
                    <span className="min-w-0 flex-1 truncate">{e.label}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{ago(e.at, now)} ↗</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-2">Nothing yet. Put an agent on-chain or turn on its autopilot, and every transaction shows up here.</p>
          )}
          {forest.lastBlock !== null && forest.updatedAt !== null && (
            <p className="mt-4 font-mono text-[11px] text-muted">
              Arc block {forest.lastBlock.toLocaleString("en-US")} · updated {ago(forest.updatedAt, now)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
