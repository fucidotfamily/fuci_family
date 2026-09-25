"use client";

import { useRef, useState, type ReactNode } from "react";
import type { RunResult, TraceStep } from "@/lib/agent";
import { pulse } from "@/hooks/useStats";
import { Erc8004Panel } from "./Erc8004Panel";

export type PlaygroundResult = RunResult & {
  run: string | null;
  houseAgentId: number | null;
  erc8004Id: number | null;
};
type Validation = {
  status: { response: number } | null;
  report?:
    | {
        score: number;
        checks: { claim: string; ok: boolean; detail: string }[];
      }
    | string;
  responseTx?: string;
  requestTx?: string | null;
};

const STRATEGIES = [
  { id: "", label: "Ask anything" },
  { id: "scout", label: "Launch Scout" },
  { id: "watcher", label: "Bonding Watcher" },
  { id: "oracle", label: "Tide Oracle" },
] as const;

const SUGGESTIONS = [
  "What launched on Argus in the last hour?",
  "Which token is closest to bonding?",
  "Is the tide coming in or going out?",
];

const ICON: Record<TraceStep["kind"], string> = {
  plan: "◎",
  request: "→",
  "402": "402",
  sign: "✎",
  settled: "✓",
  data: "▤",
  brief: "✦",
  limit: "⏸",
  error: "!",
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Ask the agent (paid over x402). With `tokenSlot`, pasting a token address shows that
 * slot (the token card) instead of running a question, and the trace only appears once used.
 */
export function Playground({
  agentId,
  defaultStrategy = "",
  placeholder = "Ask about Argus launches, bonding, or the tide…",
  tokenSlot,
  ask,
  priceLabel = "free",
}: {
  agentId?: string;
  defaultStrategy?: string;
  placeholder?: string;
  tokenSlot?: (address: string) => ReactNode;
  /** Custom asker (the owner's agent pays); defaults to the sponsored playground. */
  ask?: (prompt: string, strategy: string) => Promise<PlaygroundResult>;
  /** Shown on the Ask button, e.g. "$0.04" or "free". */
  priceLabel?: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [strategy, setStrategy] = useState(defaultStrategy);
  const [running, setRunning] = useState(false);
  const [shown, setShown] = useState<TraceStep[]>([]);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const run = async (text = prompt) => {
    timers.current.forEach(clearTimeout);
    setRunning(true);
    setError(null);
    setResult(null);
    setValidation(null);
    setShown([]);
    try {
      let r: PlaygroundResult;
      if (ask) r = await ask(text, strategy);
      else {
        const res = await fetch("/api/playground", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: text, strategy: strategy || undefined, agentId }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        r = body as PlaygroundResult;
      }
      // Replay the trace so people can watch the 402 → sign → settle dance.
      r.steps.forEach((s, i) => {
        timers.current.push(
          window.setTimeout(
            () => setShown((prev) => [...prev, s]),
            260 * (i + 1),
          ),
        );
      });
      timers.current.push(
        window.setTimeout(
          () => {
            setResult(r);
            setRunning(false);
            pulse();
          },
          260 * (r.steps.length + 1),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
    }
  };

  const validate = async () => {
    if (!result?.run) return;
    setValidating(true);
    setError(null);
    try {
      const res = await fetch("/api/validation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash: result.run }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error ?? `Validation failed (${res.status})`);
      setValidation(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setValidating(false);
    }
  };

  const report =
    validation && typeof validation.report === "object"
      ? validation.report
      : null;
  const token = tokenSlot && ADDRESS.test(prompt.trim()) ? prompt.trim() : null;
  const used =
    !tokenSlot ||
    running ||
    shown.length > 0 ||
    result !== null ||
    error !== null;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line p-5 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!token) run();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="pg-prompt" className="sr-only">
            Ask the Fucus agent
          </label>
          <input
            id="pg-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            maxLength={500}
            className="min-w-0 flex-1 field px-5 py-3 text-ink"
          />
          {!token && (
            <button
              type="submit"
              disabled={running}
              className="btn btn-primary justify-center"
            >
              {running ? "Paying the tide…" : `Ask · ${priceLabel}`}
            </button>
          )}
        </form>
        {token && tokenSlot?.(token)}
        {!token && (
          <>
            <div
              className="mt-4 flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="Agent strategy"
            >
              {STRATEGIES.map((s) => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={strategy === s.id}
                  onClick={() => setStrategy(s.id)}
                  className={`tab ${strategy === s.id ? "tab-active" : ""}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {!shown.length && !running && (
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setPrompt(q);
                      run(q);
                    }}
                    className="text-left text-xs text-muted underline decoration-dotted underline-offset-4 hover:text-ink"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {used && !token && (
        <div className="grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <ol
            className="min-h-64 space-y-2 border-b border-line bg-surface-2/50 p-5 font-mono text-xs sm:p-6 md:border-r md:border-b-0"
            aria-live="polite"
          >
            {!shown.length && !running && (
              <li className="text-muted">
                The x402 trace appears here: 402 → sign → settle, step by step.
              </li>
            )}
            {running && !shown.length && (
              <li className="text-muted">Contacting the frond…</li>
            )}
            {shown.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className={`w-9 shrink-0 text-right ${s.kind === "error" ? "text-danger" : s.kind === "settled" ? "text-up" : s.kind === "402" ? "text-ink-2" : "text-ink"}`}
                >
                  {ICON[s.kind]}
                </span>
                <span className="min-w-0">
                  <span className="text-ink">{s.label}</span>
                  {s.detail && (
                    <span className="block truncate text-muted">
                      {s.detail}
                    </span>
                  )}
                  {s.href && (
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink underline underline-offset-2"
                    >
                      view on Arcscan
                    </a>
                  )}
                </span>
                <span className="ml-auto shrink-0 text-muted">{s.t}ms</span>
              </li>
            ))}
          </ol>

          <div className="p-5 sm:p-6">
            <p className="eyebrow">Receipt</p>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            {!result && !error && (
              <p className="mt-3 text-sm text-muted">
                No run yet. Every data call is paid in real USDC over x402.
              </p>
            )}
            {result && (
              <div className="mt-3 space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Network</dt>
                    <dd className="text-ink">Arc · x402</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Spent</dt>
                    <dd className="font-mono">
                      {result.spentUsdc.toFixed(4)} USDC
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted">Frond wallet</dt>
                    <dd className="truncate font-mono text-xs">
                      {result.wallet || "not configured"}
                    </dd>
                  </div>
                </dl>
                <blockquote className="border-l-2 border-ink pl-4 text-ink-2">
                  {result.brief}
                </blockquote>
                {result.run && (
                  <div className="space-y-3 border-t border-line pt-4">
                    <p className="eyebrow">On-chain trust · ERC-8004</p>
                    <Erc8004Panel
                      agentId={result.erc8004Id}
                      tag2={strategy || "ask"}
                      compact
                    />
                    {result.houseAgentId !== null && (
                      <div className="space-y-2">
                        {!validation ? (
                          <button
                            className="btn btn-ghost !py-1.5"
                            disabled={validating}
                            onClick={validate}
                          >
                            {validating
                              ? "Re-checking on Arc… (~20s)"
                              : "Validate this run"}
                          </button>
                        ) : (
                          <div className="text-sm">
                            <p>
                              Tide checker score:{" "}
                              <b className="font-mono">
                                {validation.status?.response ??
                                  report?.score ??
                                  "?"}
                                /100
                              </b>{" "}
                              {validation.responseTx && (
                                <a
                                  className="underline"
                                  href={validation.responseTx}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  response tx
                                </a>
                              )}
                            </p>
                            {report && (
                              <ul className="mt-2 space-y-1 font-mono text-xs">
                                {report.checks.map((c, i) => (
                                  <li
                                    key={i}
                                    className={c.ok ? "text-up" : "text-danger"}
                                  >
                                    {c.ok ? "✓" : "✗"} {c.claim}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted">
                          Fuci&apos;s own re-execution validator re-reads every
                          claim from Arc at the recorded block and posts a 0–100
                          score to the ERC-8004 Validation Registry.{" "}
                          <a
                            className="underline"
                            href={`/api/runs/${result.run}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Run record
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
