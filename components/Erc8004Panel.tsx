"use client";

import { useCallback, useEffect, useState } from "react";
import { ERC8004, REPUTATION_ABI } from "@/lib/erc8004Abi";
import { SITE_CHAIN, errText, sendInjected } from "@/lib/browserWallet";

type Info = {
  agentId: number;
  owner: string;
  uri: string;
  explorer: string;
  reputation: { count: number; score: number | null };
  validations: { requestHash: string; response: number; responded: boolean; tag: string }[];
};

const SCORES = [20, 40, 60, 80, 100];

/**
 * An agent's ERC-8004 identity on Arc: reputation summary, recent validations, and a
 * "rate this agent" control that writes giveFeedback() from the visitor's own wallet.
 */
export function Erc8004Panel({ agentId, tag2, compact = false }: { agentId: number | null | undefined; tag2: string; compact?: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [score, setScore] = useState(80);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);

  const load = useCallback(() => {
    if (agentId === null || agentId === undefined) return;
    fetch(`/api/erc8004/agent/${agentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [agentId]);
  useEffect(load, [load]);

  if (agentId === null || agentId === undefined) {
    return <p className="text-sm text-muted">Not registered on ERC-8004 yet, so it has no on-chain reputation.</p>;
  }

  const rate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { hash } = await sendInjected(SITE_CHAIN, {
        address: ERC8004.reputation,
        abi: REPUTATION_ABI,
        functionName: "giveFeedback",
        args: [BigInt(agentId), BigInt(score), 0, "fuci", tag2, typeof window === "undefined" ? "" : window.location.href.slice(0, 200), "", `0x${"0".repeat(64)}`],
      });
      const explorer = SITE_CHAIN.blockExplorers?.default.url;
      setMsg({ ok: true, text: `Rated ${score}/100 on Arc.`, href: explorer ? `${explorer}/tx/${hash}` : undefined });
      setTimeout(load, 1500);
    } catch (e) {
      const text = errText(e);
      setMsg({ ok: false, text: /self|owner|operator/i.test(text) ? "An agent's owner can't rate their own agent (ERC-8004 rule)." : text });
    } finally {
      setBusy(false);
    }
  };

  const rep = info?.reputation;
  const done = info?.validations.filter((v) => v.responded) ?? [];
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <a href={info?.explorer} target="_blank" rel="noreferrer" className="font-mono text-ink underline underline-offset-2">
          ERC-8004 #{agentId}
        </a>
        <span className="text-ink-2">
          Reputation:{" "}
          <b className="font-mono text-ink">{rep ? (rep.score === null ? "no ratings yet" : `${rep.score.toFixed(0)}/100 · ${rep.count} rating${rep.count === 1 ? "" : "s"}`) : "…"}</b>
        </span>
        {!compact && (
          <span className="text-ink-2">
            Validations: <b className="font-mono text-ink">{info ? (done.length ? `${done.length} · last ${done[0].response}/100` : "none yet") : "…"}</b>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">Rate it:</span>
        {SCORES.map((s) => (
          <button key={s} onClick={() => setScore(s)} className={`tab ${score === s ? "tab-active" : ""}`} aria-pressed={score === s}>
            {s}
          </button>
        ))}
        <button className="btn btn-ghost !py-1.5" disabled={busy} onClick={rate}>
          {busy ? "Check your wallet…" : "Rate on Arc"}
        </button>
      </div>
      {msg && (
        <p className={msg.ok ? "text-up" : "text-danger"}>
          {msg.text}{" "}
          {msg.href && (
            <a className="underline" href={msg.href} target="_blank" rel="noreferrer">
              View tx
            </a>
          )}
        </p>
      )}
      <p className="text-xs text-muted">Feedback is written to the ERC-8004 Reputation Registry from your own wallet (a little USDC gas).</p>
    </div>
  );
}
