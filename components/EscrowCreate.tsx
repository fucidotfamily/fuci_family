"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { decodeEventLog, erc20Abi, type Abi } from "viem";
import { ESCROW_ABI } from "@/lib/escrowArtifact";
import { SITE_CHAIN, connectInjected, publicClient, sendInjected, TxPendingError, walletError } from "@/lib/browserWallet";
import { GRADE_COLOR } from "./RiskReportView";

const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const REVIEW = [
  { label: "24 hours", secs: 86_400 },
  { label: "3 days", secs: 3 * 86_400 },
  { label: "7 days", secs: 7 * 86_400 },
];
const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Kya = { grade: string | null; score: number | null; label: string; subject: { wallet: string; agentId: number | null; name: string | null } };

/** Lock USDC for a job: resolve the provider (agent id or wallet) with Know Your Agent, store the terms, approve, create. */
export function EscrowCreate({ escrow, feeBps, maxJobUsdc }: { escrow: `0x${string}`; feeBps: number; maxJobUsdc: number }) {
  const router = useRouter();
  const [who, setWho] = useState("");
  const [kya, setKya] = useState<{ q: string; r: Kya | null; error?: string } | null>(null);
  const [amount, setAmount] = useState("5");
  const [days, setDays] = useState(3);
  const [review, setReview] = useState(REVIEW[1].secs);
  const [evaluator, setEvaluator] = useState("");
  const [terms, setTerms] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Look the provider up (debounced) so the client sees who they are paying before locking money.
  const q = who.trim().replace(/^#/, "");
  const lookable = isAddr(q) || /^\d{1,9}$/.test(q);
  useEffect(() => {
    if (!lookable) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/kya?agent=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then(async (r) => ({ ok: r.ok, j: await r.json() }))
        .then(({ ok, j }) => setKya({ q, r: ok ? (j as Kya) : null, error: ok ? undefined : (j as { error?: string }).error }))
        .catch(() => undefined);
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, lookable]);
  const found = kya && kya.q === q ? kya : null;
  const provider = found?.r?.subject.wallet ?? (isAddr(q) ? q : null);

  const usdc = Number(amount);
  const amountOk = Number.isFinite(usdc) && usdc >= 0.01 && usdc <= maxJobUsdc;
  const evalOk = evaluator.trim() === "" || isAddr(evaluator.trim());
  const ready = Boolean(provider) && amountOk && evalOk && terms.trim().length >= 10 && !step;

  const create = async () => {
    setError(null);
    try {
      setStep("Connecting your wallet…");
      const { address } = await connectInjected(SITE_CHAIN);
      if (provider!.toLowerCase() === address.toLowerCase()) throw new Error("You can't hire yourself: the provider must be another wallet.");
      if (evaluator.trim() && evaluator.trim().toLowerCase() === provider!.toLowerCase()) throw new Error("The provider can't also be the evaluator.");
      const pub = publicClient(SITE_CHAIN);
      const units = BigInt(Math.round(usdc * 1e6));
      const bal = await pub.readContract({ address: ARC_USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      if (bal < units) throw new Error(`Your wallet has ${(Number(bal) / 1e6).toFixed(2)} USDC on Arc; this job needs ${usdc}.`);

      setStep("Saving the job terms…");
      const note = await fetch("/api/escrow/note", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: terms.trim() }) }).then(
        async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? "Couldn't save the terms");
          return j as { hash: `0x${string}`; uri: string };
        },
      );

      const allowance = await pub.readContract({ address: ARC_USDC, abi: erc20Abi, functionName: "allowance", args: [address, escrow] });
      if (allowance < units) {
        setStep("Step 1 of 2: allow the escrow to take exactly this amount (confirm in your wallet)…");
        await sendInjected(SITE_CHAIN, { address: ARC_USDC, abi: erc20Abi as Abi, functionName: "approve", args: [escrow, units] });
      }

      setStep(`${allowance < units ? "Step 2 of 2: " : ""}lock ${usdc} USDC in escrow (confirm in your wallet)…`);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + days * 86_400);
      const { hash } = await sendInjected(SITE_CHAIN, {
        address: escrow,
        abi: ESCROW_ABI as Abi,
        functionName: "createJob",
        args: [provider, evaluator.trim() || "0x0000000000000000000000000000000000000000", units, deadline, review, note.hash, note.uri, feeBps],
      });
      const receipt = await pub.getTransactionReceipt({ hash });
      let id: bigint | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics });
          if (ev.eventName === "JobCreated") id = (ev.args as { jobId: bigint }).jobId;
        } catch {}
      }
      setStep("Locked. Opening the job…");
      router.push(id ? `/escrow/${id}` : "/escrow");
      router.refresh();
    } catch (e) {
      setError(e instanceof TxPendingError ? e.message : walletError(e));
      setStep(null);
    }
  };

  const g = found?.r?.grade ?? null;
  return (
    <div className="card p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold tracking-tight">Hire an agent with escrow</h2>
      <p className="mt-1 text-sm text-ink-2">Your USDC is locked on Arc, not sent. The agent is paid when you approve the work, or you get it back.</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-2">Agent to hire: ERC-8004 id or wallet</span>
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="e.g. 12 or 0x…" spellCheck={false} autoComplete="off" className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2.5 font-mono text-sm outline-none focus:border-ink" />
          {lookable && !found && <span className="mt-1 block text-xs text-muted">Checking this agent…</span>}
          {found?.error && <span className="mt-1 block text-xs text-danger">{found.error}</span>}
          {found?.r && (
            <a href={`/kya?agent=${encodeURIComponent(q)}`} target="_blank" className="mt-2 flex items-center gap-3 rounded-md border border-line p-2.5 text-xs hover:border-ink">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border-2 font-display text-lg font-bold" style={{ borderColor: g ? GRADE_COLOR[g as keyof typeof GRADE_COLOR] : "var(--line)", color: g ? GRADE_COLOR[g as keyof typeof GRADE_COLOR] : "var(--muted)" }}>
                {g ?? "?"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-ink">
                  {found.r.subject.name ?? (found.r.subject.agentId !== null ? `Agent #${found.r.subject.agentId}` : "Wallet")} · {found.r.label}
                </span>
                <span className="block font-mono text-muted">Pays to {short(found.r.subject.wallet)} · Know Your Agent report ↗</span>
              </span>
            </a>
          )}
        </label>
        <label className="block text-sm">
          <span className="text-ink-2">Amount (USDC, max {maxJobUsdc})</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2.5 font-mono text-sm outline-none focus:border-ink" />
        </label>
        <label className="block text-sm">
          <span className="text-ink-2">Deadline to deliver</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-ink">
            {[1, 3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} day{d > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-2">Time to review the work</span>
          <select value={review} onChange={(e) => setReview(Number(e.target.value))} className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-ink">
            {REVIEW.map((r) => (
              <option key={r.secs} value={r.secs}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-2">Reviewer (optional)</span>
          <input value={evaluator} onChange={(e) => setEvaluator(e.target.value)} placeholder="You, by default" spellCheck={false} autoComplete="off" className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2.5 font-mono text-sm outline-none focus:border-ink" />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-ink-2">What should the agent deliver?</span>
          <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={4} maxLength={4000} placeholder="e.g. A daily report of new Argus launches with their risk grades, for 3 days, posted to this URL…" className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-ink" />
        </label>
      </div>

      <ul className="mt-4 space-y-1 text-xs text-muted">
        <li>• Fee: {feeBps / 100}% of the payout, only if the agent is paid. Refunds are free.</li>
        <li>• If the agent delivers and nobody answers within the review time, the agent is paid automatically.</li>
        <li>• If nothing is delivered by the deadline, anyone can send your USDC back to you.</li>
        {!evaluator.trim() && <li>• You review the work yourself. For bigger jobs, name a neutral reviewer both sides trust.</li>}
      </ul>

      {error && (
        <p className="mt-4 rounded-md border border-line p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {step && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-2" role="status">
          <span className="live-dot" /> {step}
        </p>
      )}
      <button type="button" onClick={create} disabled={!ready} className="btn btn-primary mt-5 w-full justify-center !py-3 disabled:opacity-50 sm:w-auto">
        Lock {amountOk ? usdc : ""} USDC in escrow
      </button>
    </div>
  );
}
