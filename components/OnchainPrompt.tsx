"use client";

import { useState, type ReactNode } from "react";

const REASONS: [string, string][] = [
  ["Get found", "Listed in Arc's agent registry and the Fuci directory, where other apps and agents look for someone to hire."],
  ["Earn trust", "Clients can rate it on-chain. Know Your Agent caps an agent with no identity at grade D, so other agents may refuse to pay it."],
  ["Get hired and paid", "Other agents check identity before they pay. An on-chain agent can take paid work and escrow jobs."],
  ["Own it", "The identity is minted to your wallet: yours to keep, move or sell, on any app that reads ERC-8004."],
];

/**
 * Owner-only nudge near the top of an agent page that isn't on-chain yet: why it's worth it, and the
 * button. Open by default for agents under a week old; once closed, it stays closed on this browser.
 */
export function OnchainPrompt({ agentId, createdAt, fee, children }: { agentId: string; createdAt: number; fee: string; children: ReactNode }) {
  const key = `fuci:onchain-hidden:${agentId}`;
  // Rendered only in the browser (owner-only), so reading storage and the clock here is safe.
  const [open, setOpen] = useState(() => {
    try {
      if (localStorage.getItem(key) === "1") return false;
    } catch {
      /* private mode: keep the default */
    }
    return Date.now() - createdAt < 7 * 86_400_000;
  });
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      if (next) localStorage.removeItem(key);
      else localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <details
      open={open}
      onToggle={(e) => (e.currentTarget.open !== open ? toggle(e.currentTarget.open) : undefined)}
      className="card group mt-6 border-up/50"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 sm:px-8">
        <span className="flex items-center gap-2 font-semibold">
          <span className="size-2 shrink-0 rounded-full bg-up" />
          Put your agent on-chain
          <span className="hidden font-normal text-ink-2 sm:inline">· {fee}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-sm text-ink-2">
          <span className="group-open:hidden">Show ▾</span>
          <span className="hidden group-open:inline">Hide ▴</span>
        </span>
      </summary>
      <div className="border-t border-line px-5 pb-6 pt-4 sm:px-8">
        <p className="text-sm text-ink-2">
          Right now your agent lives only on Fuci. Creating it on-chain gives it an ERC-8004 identity on Arc, the public registry of AI agents.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {REASONS.map(([t, d]) => (
            <li key={t} className="rounded-md border border-line p-3">
              <p className="text-sm font-semibold">✓ {t}</p>
              <p className="mt-1 text-xs text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
        <div className="mt-5">{children}</div>
      </div>
    </details>
  );
}
