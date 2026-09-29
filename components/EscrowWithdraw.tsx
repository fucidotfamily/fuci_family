"use client";

import { useState } from "react";
import type { Abi } from "viem";
import { ESCROW_ABI } from "@/lib/escrowArtifact";
import { SITE_CHAIN, connectInjected, publicClient, sendInjected, TxPendingError, walletError } from "@/lib/browserWallet";

/**
 * Payouts USDC refused to deliver when a job settled (the wallet was blocked by the issuer, or USDC was paused)
 * wait in the escrow for that same wallet. This lets the wallet check and collect them.
 */
export function EscrowWithdraw({ escrow }: { escrow: `0x${string}` }) {
  const [me, setMe] = useState<`0x${string}` | null>(null);
  const [owed, setOwed] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const read = async (who: `0x${string}`) =>
    setOwed((await publicClient(SITE_CHAIN).readContract({ address: escrow, abi: ESCROW_ABI as Abi, functionName: "owed", args: [who] })) as bigint);

  const check = async () => {
    setMsg(null);
    try {
      const { address } = await connectInjected(SITE_CHAIN);
      setMe(address);
      await read(address);
    } catch (e) {
      setMsg({ ok: false, text: walletError(e) });
    }
  };

  const withdraw = async () => {
    if (!me) return;
    setBusy(true);
    setMsg(null);
    try {
      await sendInjected(SITE_CHAIN, { address: escrow, abi: ESCROW_ABI as Abi, functionName: "withdraw", args: [] });
      setMsg({ ok: true, text: "Withdrawn to your wallet." });
      await read(me);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof TxPendingError ? e.message : walletError(e) });
    } finally {
      setBusy(false);
    }
  };

  const usdc = owed === null ? null : Number(owed) / 1e6;
  return (
    <section className="mt-4 border-t border-line pt-4 text-xs" aria-label="Held payouts">
      <p className="text-muted">If USDC couldn&apos;t be sent when a job settled (for example while USDC was paused), it waits here for the same wallet.</p>
      {me === null ? (
        <button type="button" className="mt-2 underline underline-offset-2 hover:text-ink" onClick={check}>
          Check for held payouts
        </button>
      ) : usdc === null ? (
        <p className="mt-2 text-muted">Checking…</p>
      ) : usdc === 0 ? (
        <p className="mt-2 text-muted">Nothing is waiting for this wallet.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-mono text-ink">{usdc.toFixed(2)} USDC waiting</span>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={withdraw}>
            {busy ? "Confirm in your wallet…" : "Withdraw"}
          </button>
        </div>
      )}
      {msg && <p className={`mt-2 ${msg.ok ? "text-up" : "text-danger"}`}>{msg.text}</p>}
    </section>
  );
}
