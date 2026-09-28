"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : n.toFixed(0);

/** A small $FUCI ticker for the header: market cap, linking to the token section. */
export function FuciChip() {
  const [mcap, setMcap] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/fuci/market")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { marketCapUsd?: number } | null) => live && m?.marketCapUsd && setMcap(m.marketCapUsd))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return (
    <Link
      href="/#fuci"
      title="$FUCI market cap (DexScreener)"
      className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-xs text-ink-2 hover:border-ink hover:text-ink md:inline-flex"
    >
      <span className="font-semibold text-ink">$FUCI</span>
      {mcap !== null && <span className="text-up">${compact(mcap)}</span>}
    </Link>
  );
}
