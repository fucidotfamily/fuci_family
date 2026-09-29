"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { knownOwner, rememberOwner } from "@/lib/myAgent";
import { SITE_CHAIN, connectInjected, walletError } from "@/lib/browserWallet";

type Job = { id: number; role: "client" | "agent" | "reviewer"; status: string; amountUsdc: number; deadline: number; reviewDeadline: number; title: string | null };

/** What the connected wallet needs to act on shows first, as a short word. */
function state(j: Job, now: number): { text: string; cls: string } {
  if (j.status === "Submitted") return now > j.reviewDeadline ? { text: "Paying out", cls: "text-ink-2" } : { text: j.role === "client" || j.role === "reviewer" ? "Review now" : "In review", cls: "text-up font-semibold" };
  if (j.status === "Funded") return now > j.deadline ? { text: "Refund due", cls: "text-danger" } : { text: "In progress", cls: "text-ink" };
  if (j.status === "Released") return { text: "Paid", cls: "text-up" };
  if (j.status === "Refunded") return { text: "Refunded", cls: "text-muted" };
  return { text: j.status, cls: "text-muted" };
}

/** The connected wallet's escrow jobs: the ones it paid for, works on or reviews. */
export function EscrowMyJobs() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    knownOwner().then((w) => live && w && setWallet(w));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!wallet) return;
    let live = true;
    fetch(`/api/escrow/mine?wallet=${wallet}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setJobs((j.jobs as Job[]) ?? []))
      .catch(() => live && setJobs([]));
    return () => {
      live = false;
    };
  }, [wallet]);

  const connect = async () => {
    setErr(null);
    try {
      const { address } = await connectInjected(SITE_CHAIN);
      rememberOwner(address);
      setWallet(address);
    } catch (e) {
      setErr(walletError(e));
    }
  };

  return (
    <section className="card p-5" aria-labelledby="my-jobs">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="my-jobs" className="font-display font-semibold">
          My jobs
        </h2>
        {wallet && <span className="font-mono text-xs text-muted">{`${wallet.slice(0, 6)}…${wallet.slice(-4)}`}</span>}
      </div>
      {!wallet ? (
        <>
          <p className="mt-2 text-sm text-muted">Connect your wallet to see the jobs you created.</p>
          <button type="button" className="btn btn-ghost mt-3 !py-1.5" onClick={connect}>
            Connect wallet
          </button>
          {err && <p className="mt-2 text-xs text-danger">{err}</p>}
        </>
      ) : jobs === null ? (
        <p className="mt-2 text-sm text-muted">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No jobs yet for this wallet.</p>
      ) : (
        <ul className="-mx-2 mt-2">
          {jobs.map((j) => {
            const s = state(j, now);
            return (
              <li key={j.id}>
                <Link href={`/escrow/${j.id}`} className="block rounded-md px-2 py-2 hover:bg-surface-2">
                  <span className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">
                      #{j.id} · {j.amountUsdc.toLocaleString("en-US")} USDC
                    </span>
                    <span className={`shrink-0 text-xs ${s.cls}`}>{s.text}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {j.role === "client" ? "" : `As ${j.role} · `}
                    {j.title ?? "Terms not on Fuci"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
