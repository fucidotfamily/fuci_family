"use client";

import { useEffect, useMemo, useState } from "react";
import { SITE_CHAIN } from "@/lib/browserWallet";
import { ERC8004 } from "@/lib/erc8004Abi";
import { avatarSvg } from "@/lib/avatar";
import { COMPLETENESS_CHECKS, queryIndex, type IndexedAgent, type SortKey } from "@/lib/agentQuery";

type Index = { total: number; builtAt: number; agents: IndexedAgent[] };

const EXPLORER = SITE_CHAIN.blockExplorers?.default.url ?? "";
const PAGE = 24;
const SORTS: { id: SortKey; label: string }[] = [
  { id: "ranked", label: "Top ranked" },
  { id: "newest", label: "Newest" },
];

async function fetchIndex(): Promise<Index> {
  const res = await fetch("/api/erc8004/directory");
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const generated = (id: number) => `data:image/svg+xml;utf8,${encodeURIComponent(avatarSvg(`erc8004-${id}`, 96))}`;

function Avatar({ agent }: { agent: IndexedAgent }) {
  const [src, setSrc] = useState(agent.image ?? generated(agent.agentId));
  return (
    // eslint-disable-next-line @next/next/no-img-element -- images come from each agent's own registration file
    <img
      src={src}
      alt=""
      width={56}
      height={56}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSrc(generated(agent.agentId))}
      className="h-14 w-14 shrink-0 rounded-full border border-line bg-surface-2 object-cover"
    />
  );
}

function AgentCard({ a }: { a: IndexedAgent }) {
  const total = COMPLETENESS_CHECKS.length;
  return (
    <article className={`card flex min-w-0 flex-col gap-3 p-4 transition hover:border-ink ${a.fuci ? "ring-1 ring-up/40" : ""}`}>
      <div className="flex items-start gap-3">
        <Avatar agent={a} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`truncate font-medium ${a.name ? "text-ink" : "text-muted"}`}>{a.name ?? (a.host === "ipfs" ? "Unnamed (card on IPFS)" : "Unnamed agent")}</h3>
            {a.fuci && <span className="rounded border border-up px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-up">Fuci +{a.bonus}</span>}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
            {a.url ? (
              <a className="hover:text-ink hover:underline" href={a.url} target="_blank" rel="noreferrer nofollow">
                {a.host}
              </a>
            ) : (
              (a.host ?? "no card")
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl font-semibold leading-none tabular-nums">#{a.rank}</p>
          <p className="mt-1 font-mono text-[11px] text-muted">{a.score} pts</p>
        </div>
      </div>

      {a.description && <p className="line-clamp-2 text-sm text-ink-2">{a.description}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <span className={`rounded border px-1.5 py-0.5 ${a.x402 ? "border-up text-up" : "border-line text-muted"}`}>{a.x402 ? "x402 ✓" : "no x402"}</span>
        <span className="flex items-center gap-1.5 rounded border border-line px-1.5 py-0.5 text-ink-2" title={a.missing.length ? `Missing: ${a.missing.join(", ")}` : "Complete profile"}>
          profile {a.complete}/{total}
          <span className="block h-1 w-10 rounded bg-line">
            <span className="block h-1 rounded bg-ink" style={{ width: `${(100 * a.complete) / total}%` }} />
          </span>
        </span>
        {a.reputation?.count ? (
          <span className="rounded border border-line px-1.5 py-0.5 text-ink-2" title="On-chain reputation (ERC-8004)">
            ★ {a.reputation.score?.toFixed(0)} · {a.reputation.count}
          </span>
        ) : null}
        {a.validations > 0 && <span className="rounded border border-line px-1.5 py-0.5 text-ink-2">✓ {a.validations} validated</span>}
        <a className="ml-auto text-muted hover:text-ink hover:underline" href={`${EXPLORER}/token/${ERC8004.identity}/instance/${a.agentId}`} target="_blank" rel="noreferrer">
          ID {a.agentId}
        </a>
      </div>
    </article>
  );
}

export function AgentDirectory() {
  const [index, setIndex] = useState<Index | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("ranked");
  const [x402Only, setX402Only] = useState(false);
  const [fuciOnly, setFuciOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [now, setNow] = useState(0);

  useEffect(() => {
    fetchIndex()
      .then((i) => {
        setIndex(i);
        setNow(Date.now());
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const results = useMemo(
    () => (index ? queryIndex([...index.agents], query, sort, x402Only).filter((a) => !fuciOnly || a.fuci) : []),
    [index, query, sort, x402Only, fuciOnly],
  );
  const stats = useMemo(() => {
    const all = index?.agents ?? [];
    return [
      { label: "Agents on Arc", value: index?.total },
      { label: "Take x402 payments", value: all.filter((a) => a.x402).length },
      { label: "Built on Fuci", value: all.filter((a) => a.fuci).length },
      { label: "Rated on-chain", value: all.filter((a) => a.reputation?.count).length },
    ];
  }, [index]);
  const reset = () => setShown(PAGE);
  const chip = (active: boolean) => `tab ${active ? "tab-active" : ""}`;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="font-display mt-1 text-3xl font-semibold tabular-nums">{index ? (s.value ?? 0).toLocaleString() : "…"}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(input);
            reset();
          }}
          className="flex gap-2"
        >
          <label htmlFor="agent-search" className="sr-only">
            Search agents
          </label>
          <input
            id="agent-search"
            type="search"
            value={input}
            onChange={(e) => {
              setInput(e.target.value.slice(0, 80));
              if (!e.target.value) setQuery("");
            }}
            placeholder="Search name, host, owner or ID"
            className="min-w-0 flex-1 field px-4 py-2.5"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSort(s.id);
                reset();
              }}
              className={chip(sort === s.id)}
              aria-pressed={sort === s.id}
            >
              {s.label}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <button onClick={() => (setX402Only((v) => !v), reset())} className={chip(x402Only)} aria-pressed={x402Only}>
            x402 only
          </button>
          <button onClick={() => (setFuciOnly((v) => !v), reset())} className={chip(fuciOnly)} aria-pressed={fuciOnly}>
            Fuci agents
          </button>
        </div>
        {index && (
          <p className="font-mono text-xs text-muted">
            {results.length.toLocaleString()} {results.length === 1 ? "agent" : "agents"}
            {query ? ` for "${query}"` : ""} · updated {ago(now - index.builtAt)}
          </p>
        )}
      </div>

      {!index && !error && <p className="text-muted">Reading the registry…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      {index && !results.length && <p className="text-muted">No agents match. Try a name, a host, an owner address or an ID.</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {results.slice(0, shown).map((a) => (
          <AgentCard key={a.agentId} a={a} />
        ))}
      </div>

      {results.length > shown && (
        <div className="flex justify-center">
          <button className="btn btn-ghost" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({results.length - shown})
          </button>
        </div>
      )}

      <details className="card p-5 text-sm text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">How ranking works</summary>
        <ul className="mt-3 space-y-1.5">
          <li>
            <b className="font-mono text-ink">40</b> takes x402 payments (other agents can pay it per call in USDC)
          </li>
          <li>
            <b className="font-mono text-ink">50</b> complete profile: {COMPLETENESS_CHECKS.join(", ")}
          </li>
          <li>
            <b className="font-mono text-ink">10</b> on-chain trust: rated by other wallets (5) and a validated run (5)
          </li>
          <li>
            <b className="font-mono text-up">+10</b> built on Fuci (capped at 100 points)
          </li>
        </ul>
      </details>
    </div>
  );
}
