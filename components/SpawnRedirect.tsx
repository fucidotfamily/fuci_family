"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { agentOfWallet, knownOwner } from "@/lib/myAgent";

/**
 * One wallet, one agent: if this browser's wallet already owns one, /spawn opens it instead of the
 * wizard. Shows a short note while it checks, so the wizard never flashes for returning owners.
 */
export function SpawnRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "none" | { id: string; name: string }>("checking");

  useEffect(() => {
    let live = true;
    knownOwner()
      .then((address) => (address ? agentOfWallet(address) : null))
      .then((a) => {
        if (!live) return;
        if (a) {
          setState({ id: a.id, name: a.name });
          router.replace(`/agent/${a.id}`);
        } else setState("none");
      })
      .catch(() => live && setState("none"));
    return () => {
      live = false;
    };
  }, [router]);

  if (state === "none") return <>{children}</>;
  return (
    <div className="card p-8 text-center text-ink-2" aria-live="polite">
      {state === "checking" ? "Checking your wallet…" : `You already have an agent. Opening ${state.name}…`}
    </div>
  );
}
