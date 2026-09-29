"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Abi } from "viem";
import { ESCROW_ABI } from "@/lib/escrowArtifact";
import { SITE_CHAIN, connectInjected, sendInjected, TxPendingError, walletError } from "@/lib/browserWallet";
import type { EscrowJob } from "@/lib/escrow";

type Action = { fn: string; label: string; args?: unknown[]; confirm?: string; primary?: boolean };

/** What the connected wallet can do with this job, as buttons. Every action is signed in the user's own wallet. */
export function EscrowJobActions({ job, escrow, now }: { job: EscrowJob; escrow: `0x${string}`; now: number }) {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [work, setWork] = useState("");

  const open = job.status === "Funded" || job.status === "Submitted";
  if (!open) return null;

  const is = (a: string) => me !== null && me.toLowerCase() === a.toLowerCase();
  const isClient = is(job.client);
  const isProvider = is(job.provider);
  const isEvaluator = is(job.evaluator);
  const expired = job.status === "Funded" && now > job.deadline;
  const reviewOver = job.status === "Submitted" && now > job.reviewDeadline;

  const actions: Action[] = [];
  // Paying is the main action only once the work is in; before that it is a small "pay early" option.
  if ((isClient || isEvaluator) && job.status === "Submitted" && !reviewOver)
    actions.push({ fn: "release", label: `Approve and pay ${job.amountUsdc} USDC`, primary: true, confirm: "Pay the agent now? This can't be undone." });
  if (isEvaluator && job.status === "Submitted" && !reviewOver) actions.push({ fn: "reject", label: "Reject the work (refund the client)", confirm: "Reject this delivery and refund the client? This can't be undone." });
  if (isProvider) actions.push({ fn: "cancel", label: "Give up the job (refund the client)", confirm: "Cancel the job and send the USDC back to the client? This can't be undone." });
  if (isClient && job.status === "Funded" && !expired) actions.push({ fn: "extendDeadline", label: "Give 7 more days", args: [BigInt(Math.floor(job.deadline / 1000) + 7 * 86_400)] });
  if (expired) actions.push({ fn: "refundExpired", label: "Refund the client (deadline passed)", primary: true });
  if ((isClient || isEvaluator) && job.status === "Funded" && !expired)
    actions.push({ fn: "release", label: "Pay early (before delivery)", confirm: "Nothing has been delivered yet. Pay the agent now anyway? This can't be undone." });
  if (reviewOver) actions.push({ fn: "claimTimeout", label: "Pay the provider (review time is over)", primary: true });

  const run = async (a: Action) => {
    if (a.confirm && !window.confirm(a.confirm)) return;
    setBusy(a.fn);
    setMsg(null);
    try {
      await sendInjected(SITE_CHAIN, { address: escrow, abi: ESCROW_ABI as Abi, functionName: a.fn, args: [BigInt(job.id), ...(a.args ?? [])] });
      setMsg({ kind: "ok", text: "Done. Updating…" });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof TxPendingError ? e.message : walletError(e) });
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setBusy("submit");
    setMsg(null);
    try {
      const note = await fetch("/api/escrow/note", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: work.trim() }) }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't save the delivery");
        return j as { hash: `0x${string}`; uri: string };
      });
      await sendInjected(SITE_CHAIN, { address: escrow, abi: ESCROW_ABI as Abi, functionName: "submit", args: [BigInt(job.id), note.hash, note.uri] });
      setMsg({ kind: "ok", text: "Delivered. The review time has started." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof TxPendingError ? e.message : walletError(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card mt-4 p-5" aria-labelledby="job-actions">
      <h2 id="job-actions" className="font-display text-lg font-semibold">
        Actions
      </h2>
      {me === null ? (
        <>
          <p className="mt-1 text-sm text-ink-2">Connect the wallet you use for this job to see what you can do.{expired || reviewOver ? " Anyone can settle it now." : ""}</p>
          <button
            type="button"
            className="btn btn-primary mt-3"
            onClick={async () => {
              try {
                setMe((await connectInjected(SITE_CHAIN)).address);
              } catch (e) {
                setMsg({ kind: "err", text: walletError(e) });
              }
            }}
          >
            Connect wallet
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-2">
            You are {[isClient && "the client", isProvider && "the provider", isEvaluator && !isClient && "the reviewer"].filter(Boolean).join(" and ") || "not part of this job"}.
          </p>
          {isProvider && job.status === "Funded" && !expired && (
            <div className="mt-3">
              <label className="block text-sm">
                <span className="text-ink-2">Your delivery: a link or a short summary</span>
                <textarea value={work} onChange={(e) => setWork(e.target.value)} rows={3} maxLength={4000} className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-ink" />
              </label>
              <button type="button" disabled={busy !== null || work.trim().length < 3} onClick={submit} className="btn btn-primary mt-2 disabled:opacity-50">
                {busy === "submit" ? "Confirm in your wallet…" : "Deliver the work"}
              </button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a) => (
              <button key={a.fn} type="button" disabled={busy !== null} onClick={() => run(a)} className={`btn ${a.primary ? "btn-primary" : "btn-ghost"} disabled:opacity-50`}>
                {busy === a.fn ? "Confirm in your wallet…" : a.label}
              </button>
            ))}
          </div>
          {actions.length === 0 && !(isProvider && job.status === "Funded") && <p className="mt-2 text-sm text-muted">Nothing to do for this wallet right now.</p>}
        </>
      )}
      {msg && (
        <p className={`mt-3 text-sm ${msg.kind === "err" ? "text-danger" : "text-ink"}`} role={msg.kind === "err" ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
