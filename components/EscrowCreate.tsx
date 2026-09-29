"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { decodeEventLog, erc20Abi, type Abi } from "viem";
import { ESCROW_ABI } from "@/lib/escrowArtifact";
import { SITE_CHAIN, connectInjected, publicClient, sendInjected, TxPendingError, walletError } from "@/lib/browserWallet";
import { GRADE_COLOR } from "./RiskReportView";
import { DAILY_DAYS, JOB_TYPES, MAX_PROMPT, deadlineDaysFor, encodeTerms, minUsdcFor, type JobSpec, type JobType } from "@/lib/escrowJobs";

const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
const REVIEW = [
  { label: "24 hours", secs: 86_400 },
  { label: "3 days", secs: 3 * 86_400 },
  { label: "7 days", secs: 7 * 86_400 },
];
const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Kya = { grade: string | null; score: number | null; label: string; subject: { wallet: string; agentId: number | null; name: string | null } };
type Fuci = { fuci: true; id: string; name: string; erc8004Id: number | null; wallet: string; image: string; ready: boolean; minUsdc: number };

/** Lock USDC for a job: resolve the provider (agent id or wallet) with Know Your Agent, store the terms, approve, create. */
export function EscrowCreate({ escrow, feeBps, maxJobUsdc, initialAgent = "" }: { escrow: `0x${string}`; feeBps: number; maxJobUsdc: number; initialAgent?: string }) {
  const router = useRouter();
  const [who, setWho] = useState(initialAgent);
  const [kya, setKya] = useState<{ q: string; fuci: Fuci | null; r: Kya | null; error?: string } | null>(null);
  const [amount, setAmount] = useState("0.2");
  const [jobType, setJobType] = useState<JobType>("report");
  const [target, setTarget] = useState("");
  const [runDays, setRunDays] = useState<number>(DAILY_DAYS[0]);
  const [days, setDays] = useState(3);
  const [review, setReview] = useState(REVIEW[1].secs);
  const [evaluator, setEvaluator] = useState("");
  const [terms, setTerms] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Look the provider up (debounced) so the client sees who they are paying before locking money.
  const q = who.trim().replace(/^#/, "");
  const lookable = isAddr(q) || /^\d{1,9}$/.test(q) || /^[a-z0-9-]{2,64}$/i.test(q);
  useEffect(() => {
    if (!lookable) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        // A Fuci agent first (it works the job by itself); anything else gets a Know Your Agent check.
        const f = await fetch(`/api/escrow/agent?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json());
        if (f?.fuci) return setKya({ q, fuci: f as Fuci, r: null });
        if (!isAddr(q) && !/^\d{1,9}$/.test(q)) return setKya({ q, fuci: null, r: null, error: "No Fuci agent with that name. Use an agent ID or a wallet." });
        const r = await fetch(`/api/kya?agent=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const j = await r.json();
        setKya({ q, fuci: null, r: r.ok ? (j as Kya) : null, error: r.ok ? undefined : (j as { error?: string }).error });
      } catch {
        // aborted or offline
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, lookable]);
  const found = kya && kya.q === q ? kya : null;
  const fuci = found?.fuci ?? null;
  const provider = fuci ? (fuci.ready ? fuci.wallet : null) : (found?.r?.subject.wallet ?? (found && isAddr(q) ? q : null));
  // A Fuci agent gets a typed job it knows how to do; any other agent gets free-text terms.
  const spec: JobSpec | null = !fuci
    ? null
    : jobType === "risk"
      ? { type: "risk", target: target.trim() }
      : jobType === "kya"
        ? { type: "kya", agent: target.trim().replace(/^#/, "") }
        : jobType === "daily"
          ? { type: "daily", prompt: terms.trim(), days: runDays }
          : { type: "report", prompt: terms.trim() };
  const specOk =
    !spec ||
    (spec.type === "risk" ? isAddr(spec.target) || /^[a-z0-9-]{2,64}$/i.test(spec.target) : spec.type === "kya" ? isAddr(spec.agent) || /^\d{1,9}$/.test(spec.agent) : spec.prompt.length >= 10);
  const minUsdc = spec ? minUsdcFor(spec) : 0.01;
  const dueDays = spec ? deadlineDaysFor(spec, days) : days;

  const usdc = Number(amount);
  const amountOk = Number.isFinite(usdc) && usdc >= minUsdc && usdc <= maxJobUsdc;
  const evalOk = evaluator.trim() === "" || isAddr(evaluator.trim());
  const ready = Boolean(provider) && amountOk && evalOk && (spec ? specOk : terms.trim().length >= 10) && !step;

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
      const note = await fetch("/api/escrow/note", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: spec ? encodeTerms(spec) : terms.trim() }) }).then(
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
      const deadline = BigInt(Math.floor(Date.now() / 1000) + dueDays * 86_400);
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
  const field = "field mt-1.5 block w-full px-3.5 py-3 text-sm";
  return (
    <div className="card p-5 sm:p-7">
      <h2 className="font-display text-xl font-semibold tracking-tight">Hire an agent</h2>

      <div className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="text-ink-2">Agent</span>
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="fuci, an agent ID or a wallet" spellCheck={false} autoComplete="off" className={`${field} font-mono`} />
          {lookable && !found && <span className="mt-1.5 block text-xs text-muted">Checking this agent…</span>}
          {found?.error && <span className="mt-1.5 block text-xs text-danger">{found.error}</span>}
          {fuci && (
            <span className="mt-2 flex items-center gap-3 rounded-lg border border-up/50 bg-up/5 p-2.5 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fuci.image} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-md border border-line object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">
                  {fuci.name}
                  {fuci.erc8004Id !== null ? ` · #${fuci.erc8004Id}` : ""}
                </span>
                {fuci.ready ? (
                  <span className="block text-up">✓ Fuci agent · does the job by itself, usually within 10 minutes</span>
                ) : (
                  <span className="block text-danger">Its wallet is empty, so it can&apos;t take jobs right now.</span>
                )}
              </span>
            </span>
          )}
          {found?.r && (
            <a href={`/kya?agent=${encodeURIComponent(q)}`} target="_blank" className="mt-2 flex items-center gap-3 rounded-lg border border-line p-2.5 text-xs hover:border-ink">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border-2 font-display text-lg font-bold" style={{ borderColor: g ? GRADE_COLOR[g as keyof typeof GRADE_COLOR] : "var(--line)", color: g ? GRADE_COLOR[g as keyof typeof GRADE_COLOR] : "var(--muted)" }}>
                {g ?? "?"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-ink">
                  {found.r.subject.name ?? (found.r.subject.agentId !== null ? `Agent #${found.r.subject.agentId}` : "Wallet")} · {found.r.label}
                </span>
                <span className="block font-mono text-muted">Not a Fuci agent: it must deliver by itself · pays to {short(found.r.subject.wallet)} ↗</span>
              </span>
            </a>
          )}
        </label>

        {fuci && (
          <div className="text-sm">
            <span className="text-ink-2">Job</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Job type">
              {JOB_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  role="radio"
                  aria-checked={jobType === t.type}
                  onClick={() => {
                    setJobType(t.type);
                    const min = t.type === "daily" ? 0.2 * runDays : 0.2;
                    if (!(Number(amount) >= min)) setAmount(String(Math.round(min * 100) / 100));
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${jobType === t.type ? "border-up bg-up/10" : "border-line hover:border-ink"}`}
                >
                  <span className="block font-medium text-ink">{t.label}</span>
                  <span className="block text-xs text-muted">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {fuci && (jobType === "risk" || jobType === "kya") ? (
          <label className="block text-sm">
            <span className="text-ink-2">{jobType === "risk" ? "Token or protocol" : "Agent to check"}</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={jobType === "risk" ? "0x… or e.g. morpho-blue" : "e.g. 196 or 0x…"} spellCheck={false} autoComplete="off" className={`${field} font-mono`} />
          </label>
        ) : (
          <label className="block text-sm">
            <span className="text-ink-2">{fuci ? (jobType === "daily" ? "Topic for each day" : "Your question") : "The job"}</span>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              maxLength={fuci ? MAX_PROMPT : 4000}
              placeholder={fuci ? (jobType === "daily" ? "e.g. New Argus launches today: which look safest and why?" : "e.g. Which new Argus launches look safest right now, and why?") : "What should the agent deliver?"}
              className={field}
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-ink-2">Amount</span>
            <span className="relative block">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${field} pr-16 font-mono text-lg`} />
              <span className="pointer-events-none absolute right-3.5 top-1/2 mt-0.5 -translate-y-1/2 text-xs text-muted">USDC</span>
            </span>
          </label>
          {fuci && jobType === "daily" ? (
            <label className="block text-sm">
              <span className="text-ink-2">For</span>
              <select
                value={runDays}
                onChange={(e) => {
                  const d = Number(e.target.value);
                  setRunDays(d);
                  if (!(Number(amount) >= 0.1 * d)) setAmount(String(Math.round(0.2 * d * 100) / 100));
                }}
                className={field}
              >
                {DAILY_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-ink-2">Deadline</span>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={field}>
                {[1, 3, 7, 14, 30].map((d) => (
                  <option key={d} value={d}>
                    {d} day{d > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <details className="group text-sm">
          <summary className="cursor-pointer list-none text-ink-2 hover:text-ink">
            <span className="inline-block transition group-open:rotate-90">›</span> More options
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-ink-2">Review time</span>
              <select value={review} onChange={(e) => setReview(Number(e.target.value))} className={field}>
                {REVIEW.map((r) => (
                  <option key={r.secs} value={r.secs}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-ink-2">Reviewer</span>
              <input value={evaluator} onChange={(e) => setEvaluator(e.target.value)} placeholder="You (default)" spellCheck={false} autoComplete="off" className={`${field} font-mono`} />
            </label>
          </div>
        </details>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-line p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {step && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-2" role="status">
          <span className="live-dot" /> {step}
        </p>
      )}
      <button type="button" onClick={create} disabled={!ready} className="btn btn-primary mt-6 w-full justify-center !py-3.5 text-base disabled:opacity-50">
        Lock {amountOk ? usdc : ""} USDC
      </button>
      <p className="mt-3 text-center text-xs text-muted">
        {fuci ? `Min ${Math.round(minUsdc * 100) / 100} USDC · ` : ""}Max {maxJobUsdc} USDC · {feeBps / 100}% fee only if paid · refunds are free
      </p>
    </div>
  );
}
