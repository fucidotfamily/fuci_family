"use client";

import { useCallback, useEffect, useState } from "react";
import { ERC8004, IDENTITY_ABI } from "@/lib/erc8004Abi";
import { SITE_CHAIN, errText, sendInjected } from "@/lib/browserWallet";
import { useIsOwner } from "./OwnerTools";

type State = { agentId: string; uri: string; wallet: string; linked: boolean; current: string | null };

/**
 * Links the agent's own wallet to its ERC-8004 identity (setAgentWallet), so explorers can see
 * the wallet that actually pays and trades. The agent wallet signs its consent; the owner sends it.
 */
export function AgentWalletLink({ agent, owner, banner = false }: { agent: string; owner: string; banner?: boolean }) {
  const mine = useIsOwner(owner);
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState<"link" | "refresh" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/agent/${agent}/agent-wallet`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setS)
      .catch(() => setS(null));
  }, [agent]);
  useEffect(load, [load]);

  if (!s) return null;
  const short = `${s.wallet.slice(0, 6)}…${s.wallet.slice(-4)}`;
  // Banner (Overview): only for the owner, only until the wallet is linked; confirmation stays visible once.
  if (banner && (!mine || (s.linked && !msg))) return null;

  const link = async () => {
    setBusy("link");
    setMsg(null);
    try {
      const r = await fetch(`/api/agent/${agent}/agent-wallet`, { method: "POST" });
      const sig = await r.json();
      if (!r.ok) throw new Error(sig.error ?? "Couldn't get the agent wallet's signature");
      const { hash } = await sendInjected(SITE_CHAIN, {
        address: ERC8004.identity,
        abi: IDENTITY_ABI,
        functionName: "setAgentWallet",
        args: [BigInt(sig.agentId), sig.wallet, BigInt(sig.deadline), sig.signature],
      });
      const explorer = SITE_CHAIN.blockExplorers?.default.url;
      setMsg({ ok: true, text: "Agent wallet linked on Arc.", href: explorer ? `${explorer}/tx/${hash}` : undefined });
      setTimeout(load, 1500);
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  // Re-saves the same agentURI: the URIUpdated event tells explorers to re-read the registration file.
  const refresh = async () => {
    setBusy("refresh");
    setMsg(null);
    try {
      const { hash } = await sendInjected(SITE_CHAIN, { address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "setAgentURI", args: [BigInt(s.agentId), s.uri] });
      const explorer = SITE_CHAIN.blockExplorers?.default.url;
      setMsg({ ok: true, text: "Done. Explorers such as 8004scan re-read the profile within a few hours.", href: explorer ? `${explorer}/tx/${hash}` : undefined });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  if (banner)
    return (
      <div className="mt-4 rounded-2xl border border-up/50 bg-up/5 p-4 text-sm sm:p-5">
        {s.linked ? (
          <p className="text-up">
            ✓ Linked. {short} is now this agent&apos;s wallet on-chain (ERC-8004 #{s.agentId}).{" "}
            {msg?.href && (
              <a className="underline" href={msg.href} target="_blank" rel="noreferrer">
                View tx
              </a>
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-ink">Link your agent&apos;s wallet to its on-chain ID</p>
              <p className="mt-1 text-ink-2">
                ERC-8004 #{s.agentId} belongs to you, but the wallet your agent pays and trades from ({short}) isn&apos;t linked to it yet. Until then, Know Your Agent and
                explorers like 8004scan can&apos;t tell that wallet is your agent. One transaction, a little USDC gas.
              </p>
              {msg && !msg.ok && <p className="mt-2 text-danger">{msg.text}</p>}
            </div>
            <button className="btn btn-primary shrink-0 !py-2" disabled={busy !== null} onClick={link}>
              {busy === "link" ? "Check your wallet…" : "Link wallet"}
            </button>
          </div>
        )}
      </div>
    );

  return (
    <div className="mt-4 rounded-xl border border-line p-4 text-sm">
      <p className="text-ink-2">
        Agent wallet on ERC-8004:{" "}
        <b className={`font-mono ${s.linked ? "text-up" : "text-ink"}`}>{s.linked ? `linked · ${short}` : s.current ? "a different wallet" : "not linked"}</b>
      </p>
      {!s.linked && mine && (
        <>
          <p className="mt-1 text-xs text-muted">
            Link {short}, the wallet your agent pays and trades from, to its on-chain identity. Explorers like 8004scan use it to show the agent&apos;s real activity. You sign one transaction (a little USDC gas).
          </p>
          <button className="btn btn-ghost mt-3 !py-1.5" disabled={busy !== null} onClick={link}>
            {busy === "link" ? "Check your wallet…" : "Link agent wallet"}
          </button>
        </>
      )}
      {mine && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs text-muted">Changed the profile? Tell explorers (8004scan and others) to re-read it. One transaction, a little USDC gas.</p>
          <button className="btn btn-ghost mt-2 !py-1.5" disabled={busy !== null} onClick={refresh}>
            {busy === "refresh" ? "Check your wallet…" : "Refresh on explorers"}
          </button>
        </div>
      )}
      {msg && (
        <p className={`mt-2 ${msg.ok ? "text-up" : "text-danger"}`}>
          {msg.text}{" "}
          {msg.href && (
            <a className="underline" href={msg.href} target="_blank" rel="noreferrer">
              View tx
            </a>
          )}
        </p>
      )}
    </div>
  );
}
