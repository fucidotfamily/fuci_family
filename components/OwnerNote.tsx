"use client";

import { useEffect, useState } from "react";
import { knownOwner } from "@/lib/myAgent";

/** Tells the visitor when this frond is theirs (their wallet is its holdfast). */
export function OwnerNote({ owner }: { owner: string }) {
  const [mine, setMine] = useState(false);
  useEffect(() => {
    knownOwner()
      .then((a) => setMine(Boolean(a && a.toLowerCase() === owner.toLowerCase())))
      .catch(() => setMine(false));
  }, [owner]);
  if (!mine) return null;
  return <span className="rounded border border-ink px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-ink">Your agent</span>;
}
