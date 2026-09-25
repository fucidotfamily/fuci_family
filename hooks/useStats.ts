"use client";

import { useEffect, useState } from "react";
import type { Stats } from "@/lib/store";

export type StatsResponse = Stats & { titheUsdc: number; titheBps: number };

/** Polls /api/stats; refetches immediately when anything fires `fuci:pulse`. */
export function useStats(intervalMs = 10_000) {
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (res.ok && alive) setStats(await res.json());
      } catch {
        // keep the last good value
      }
    };
    load();
    const id = window.setInterval(load, intervalMs);
    window.addEventListener("fuci:pulse", load);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("fuci:pulse", load);
    };
  }, [intervalMs]);

  return stats;
}

export const pulse = () => window.dispatchEvent(new Event("fuci:pulse"));
