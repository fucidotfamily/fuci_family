"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type Hit = { slug: string; name: string; category: string | null; tvl: number; onArc: boolean };

const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`);

/** Search box for /risk: a token address on Arc, or a protocol name (suggested from DefiLlama). */
export function RiskSearch({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [found, setFound] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const isAddress = /^0x[0-9a-fA-F]{40}$/.test(q.trim());

  const s = q.trim();
  const searchable = s.length >= 2 && !s.startsWith("0x");
  // Suggestions only count for the text they were fetched for.
  const hits = searchable && found.q === s ? found.hits : [];

  useEffect(() => {
    if (!searchable) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/risk/search?q=${encodeURIComponent(s)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((j: { protocols?: Hit[] }) => setFound({ q: s, hits: j.protocols ?? [] }))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [s, searchable]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    startTransition(() => router.push(href));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddress) go(`/risk?token=${s.toLowerCase()}`);
    else if (hits[0]) go(`/risk?protocol=${hits[0].slug}`);
  };

  return (
    <div ref={box} className="relative">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" role="search">
        <label htmlFor="risk-q" className="sr-only">
          Token address or protocol name
        </label>
        <input
          id="risk-q"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Token address on Arc (0x…) or a protocol, e.g. Morpho"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-4 py-3 font-mono text-sm text-ink outline-none focus:border-ink"
        />
        <button type="submit" disabled={busy || (!isAddress && !hits.length)} className="btn btn-primary justify-center !py-3 disabled:opacity-50">
          {busy ? "Checking…" : "Check risk"}
        </button>
      </form>
      {open && hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-md border border-line bg-bg shadow-lg" role="listbox">
          {hits.map((h) => (
            <li key={h.slug}>
              <button type="button" onClick={() => go(`/risk?protocol=${h.slug}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate text-ink">{h.name}</span>
                {h.onArc && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-ink-2">ARC</span>}
                <span className="shrink-0 font-mono text-xs text-muted">
                  {h.category ?? ""} · {usd(h.tvl)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
