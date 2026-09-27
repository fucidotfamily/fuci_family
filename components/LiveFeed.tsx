"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/feed";

const ago = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

const DOT: Record<FeedItem["kind"], string> = {
  payment: "bg-up",
  agent: "bg-sky-400",
  buy: "bg-up",
  sell: "bg-amber-400",
};

/** Real agent payments and on-chain events, newest first. Server-rendered, then refreshed every 15 s while visible. */
export function LiveFeed({
  initial,
  serverNow,
  rows = 5,
}: {
  initial: FeedItem[];
  serverNow: number;
  rows?: number;
}) {
  const [items, setItems] = useState(initial);
  // Start from the server's clock so the first render matches (no hydration mismatch).
  const [now, setNow] = useState(serverNow);
  const seen = useRef(new Set(initial.map((i) => `${i.at}:${i.text}`)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch("/api/feed")
        .then((x) => x.json() as Promise<{ items?: FeedItem[] }>)
        .catch(() => null);
      if (!r?.items?.length) return;
      const added = r.items
        .map((i) => `${i.at}:${i.text}`)
        .filter((k) => !seen.current.has(k));
      added.forEach((k) => seen.current.add(k));
      setFresh(new Set(added));
      setItems(r.items);
    };
    const poll = setInterval(load, 15_000);
    const clock = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const shown = items.slice(0, rows);
  return (
    <div className="card overflow-hidden" aria-live="polite">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ink-2">
          <span className="live-dot" /> Agents paying right now
        </p>
        <a
          href="/stats"
          className="font-mono text-[11px] text-muted hover:text-ink"
        >
          All stats →
        </a>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-2">
          Waiting for the next payment…
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {shown.map((i) => {
            const key = `${i.at}:${i.text}`;
            const body = (
              <>
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[i.kind]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-sm leading-snug text-ink">
                    {i.text}
                  </span>
                  {i.sub && (
                    <span className="block truncate font-mono text-[11px] text-muted">
                      {i.sub}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {ago(now - i.at)}
                </span>
              </>
            );
            return (
              <li key={key} className={fresh.has(key) ? "feed-in" : undefined}>
                {i.href ? (
                  <a
                    href={i.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-2"
                    title="Check it on the Arc explorer"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="flex items-start gap-3 px-4 py-2.5">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
