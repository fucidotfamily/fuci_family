"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { agentOfWallet, forgetOwner, knownOwner } from "@/lib/myAgent";

/** "My agent" when this browser's wallet already owns a frond, otherwise "Spawn agent". */
export function MyAgentButton() {
  const [mine, setMine] = useState<{ id: string; name: string } | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      knownOwner()
        .then((address) => {
          setWallet(address);
          return address ? agentOfWallet(address) : null;
        })
        .then((a) => setMine(a ? { id: a.id, name: a.name } : null))
        .catch(() => setMine(null));
    load();
    // Re-check after connecting on /spawn or switching accounts in the wallet.
    window.addEventListener("fuci:owner", load);
    const eth = (window as unknown as { ethereum?: { on?: (e: string, f: () => void) => void; removeListener?: (e: string, f: () => void) => void } }).ethereum;
    eth?.on?.("accountsChanged", load);
    return () => {
      window.removeEventListener("fuci:owner", load);
      eth?.removeListener?.("accountsChanged", load);
    };
  }, []);

  const disconnect = async () => {
    await forgetOwner();
    window.location.reload();
  };

  const main = mine ? (
    <Link href={`/agent/${mine.id}`} className="btn btn-primary !px-4 !py-2" title={`Your agent: ${mine.name}`} aria-haspopup={wallet ? "menu" : undefined}>
      My agent
    </Link>
  ) : (
    <Link href="/spawn" className="btn btn-primary !px-4 !py-2" aria-haspopup={wallet ? "menu" : undefined}>
      Spawn agent
    </Link>
  );
  if (!wallet) return main;

  // The wallet menu opens on hover or keyboard focus of the button (pt-2 bridges the gap so it stays open).
  return (
    <div className="group relative">
      {main}
      <div className="invisible absolute right-0 top-full z-50 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div role="menu" className="min-w-52 rounded-md border border-line bg-bg p-1 shadow-lg">
          <p className="px-3 py-2 font-mono text-[11px] text-muted">
            {wallet.slice(0, 6)}…{wallet.slice(-4)}
          </p>
          {mine && (
            <Link role="menuitem" href={`/agent/${mine.id}`} className="block rounded px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
              View {mine.name}
            </Link>
          )}
          <button role="menuitem" onClick={disconnect} className="block w-full rounded px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            Disconnect wallet
          </button>
        </div>
      </div>
    </div>
  );
}
