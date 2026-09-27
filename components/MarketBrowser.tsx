"use client";

import { useMemo, useState } from "react";
import { searchMarket, type Listing } from "@/lib/marketSearch";
import { CopyButton } from "./CopyButton";

const EXPLORER = "https://explorer.arc.io";
const IDENTITY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const PAGE = 30;
const SUGGESTIONS = ["search", "price", "argus", "trust", "token", "geo"];

const price = (n: number) => (n >= 0.01 ? `$${n.toFixed(2)}` : `$${n.toPrecision(2).replace(/0+$/, "")}`);
const ago = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

type Sort = "relevant" | "cheapest";

function Card({ l }: { l: Listing }) {
  return (
    <article className={`card flex min-w-0 flex-col gap-3 p-4 ${l.source === "fuci" ? "ring-1 ring-up/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium capitalize text-ink">{l.name}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
            {l.seller.name}
            {l.seller.agentId !== null && (
              <>
                {" · "}
                <a className="hover:text-ink hover:underline" href={`${EXPLORER}/token/${IDENTITY}/instance/${l.seller.agentId}`} target="_blank" rel="noreferrer">
                  agent #{l.seller.agentId}
                </a>
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl font-semibold leading-none tabular-nums">{price(l.priceUsdc)}</p>
          <p className="mt-1 font-mono text-[11px] text-muted">per call</p>
        </div>
      </div>
      {l.description && <p className="line-clamp-3 text-sm text-ink-2">{l.description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <span className="rounded border border-up px-1.5 py-0.5 text-up" title={`Answered 402 with an Arc USDC price ${ago(l.checkedAt)}`}>
          live ✓ {ago(l.checkedAt)}
        </span>
        {l.networks.slice(0, 3).map((n) => (
          <span key={n} className={`rounded border px-1.5 py-0.5 ${n === "Arc" ? "border-ink text-ink" : "border-line text-muted"}`}>
            {n}
          </span>
        ))}
        {l.networks.length > 3 && (
          <span className="rounded border border-line px-1.5 py-0.5 text-muted" title={l.networks.slice(3).join(", ")}>
            +{l.networks.length - 3}
          </span>
        )}
        <span className="rounded border border-line px-1.5 py-0.5 text-muted">{l.method}</span>
      </div>
      <div className="flex items-center gap-2 border-t border-line pt-3">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{l.url}</code>
        <CopyButton text={l.url} />
      </div>
    </article>
  );
}

export function MarketBrowser({ listings }: { listings: Listing[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("relevant");
  const [shown, setShown] = useState(PAGE);
  const hits = useMemo(() => {
    const found = searchMarket(listings, q);
    return sort === "cheapest" ? [...found].sort((a, b) => a.priceUsdc - b.priceUsdc) : found;
  }, [listings, q, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(PAGE);
          }}
          placeholder="Search paid APIs: web search, prices, news…"
          aria-label="Search the market"
          className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="rounded border border-line bg-surface px-3 py-2 text-sm">
          <option value="relevant">Most relevant</option>
          <option value="cheapest">Cheapest first</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => setQ(s)} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink">
            {s}
          </button>
        ))}
      </div>
      <p className="mt-4 font-mono text-[11px] text-muted">
        {hits.length} {hits.length === 1 ? "API" : "APIs"}
        {q && ` for “${q}”`}
      </p>
      {hits.length === 0 ? (
        <p className="card mt-3 p-6 text-sm text-muted">Nothing matches yet. Sell it yourself: list your API below.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hits.slice(0, shown).map((l) => (
            <Card key={l.id} l={l} />
          ))}
        </div>
      )}
      {hits.length > shown && (
        <button type="button" className="btn btn-ghost mt-4" onClick={() => setShown((n) => n + PAGE)}>
          Show more
        </button>
      )}
    </div>
  );
}

export function ListYourApi() {
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/market/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, method }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setMsg({ ok: true, text: `Listed: ${body.listing.name} at ${price(body.listing.priceUsdc)} per call. Refresh to see it.` });
      setUrl("");
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-2">
      <select value={method} onChange={(e) => setMethod(e.target.value as "GET" | "POST")} aria-label="Method" className="rounded border border-line bg-surface px-3 py-2 text-sm">
        <option>GET</option>
        <option>POST</option>
      </select>
      <input
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://api.example.com/paid-endpoint"
        aria-label="Your paid endpoint URL"
        className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-ink"
      />
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? "Checking…" : "List it"}
      </button>
      {msg && <p className={`basis-full text-sm ${msg.ok ? "text-up" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
