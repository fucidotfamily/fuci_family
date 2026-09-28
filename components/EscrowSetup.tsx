"use client";

import { useState } from "react";
import { ESCROW_ABI, ESCROW_BYTECODE } from "@/lib/escrowArtifact";
import { SITE_CHAIN, connectInjected, waitForReceipt, walletError } from "@/lib/browserWallet";
import type { EscrowInfo } from "@/lib/escrow";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ARC_USDC = "0x3600000000000000000000000000000000000000";

/** /setup step: deploy FuciEscrow from the owner wallet, then hand ownership to the treasury Safe. */
export function EscrowSetup({
  escrow,
  owner,
  treasuryDefault,
  onDeployed,
}: {
  escrow: EscrowInfo | null | undefined;
  owner: string;
  treasuryDefault: string;
  onDeployed: (txHash: string) => Promise<boolean>;
}) {
  const [treasury, setTreasury] = useState(treasuryDefault);
  const [maxJob, setMaxJob] = useState(100);
  const [maxTotal, setMaxTotal] = useState(5_000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const explorer = SITE_CHAIN.blockExplorers?.default.url;

  if (escrow) {
    return (
      <section className="card p-6">
        <p className="eyebrow">Step 7 · Job escrow</p>
        <div className="mt-3 space-y-1 text-sm text-ink-2">
          <p>
            ✓ Live at{" "}
            <a className="break-all font-mono text-ink underline" href={`${explorer}/address/${escrow.address}`} target="_blank" rel="noreferrer">
              {escrow.address}
            </a>
          </p>
          <p>
            Locked: <b className="font-mono text-ink">{escrow.lockedUsdc.toFixed(2)} USDC</b> · {escrow.jobs} jobs · fee {escrow.feeBps / 100}% · caps {escrow.maxJobUsdc} USDC per job,{" "}
            {escrow.maxTotalUsdc} USDC total{escrow.paused ? " · PAUSED" : ""}
          </p>
          <p>
            Owner <span className="font-mono">{short(escrow.owner)}</span> · fees to <span className="font-mono">{short(escrow.treasury)}</span>
          </p>
          {escrow.owner.toLowerCase() !== escrow.treasury.toLowerCase() && (
            <p className="text-xs text-muted">
              Recommended: hand ownership to the treasury Safe. Call <code className="font-mono">transferOwnership({short(escrow.treasury)})</code> from the owner, then{" "}
              <code className="font-mono">acceptOwnership()</code> from the Safe. The owner can only change the fee (max 5%), the caps, the treasury and pause new jobs. It can never move
              a job&apos;s USDC.
            </p>
          )}
        </div>
      </section>
    );
  }

  const valid = /^0x[0-9a-fA-F]{40}$/.test(treasury) && maxJob >= 1 && maxJob <= 1_000_000 && maxTotal >= maxJob;
  return (
    <section className="card p-6">
      <p className="eyebrow">Step 7 · Job escrow</p>
      <div className="mt-3 space-y-3 text-sm text-ink-2">
        <p>
          Deploy FuciEscrow from your wallet. Clients lock USDC for a job, the provider agent gets paid when the work is approved (or the review time runs out), and the client is
          refunded if nothing is delivered. The locked USDC is Fuci&apos;s TVL. Fee: 1% of paid-out jobs, to the treasury. Start with low caps and raise them later.
        </p>
        <label className="block">
          Treasury (receives the fees; use the Safe)
          <input className="mt-1 block w-full field px-3 py-2 font-mono text-xs" value={treasury} onChange={(e) => setTreasury(e.target.value.trim())} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            Max per job (USDC)
            <input type="number" min={1} className="mt-1 block w-full field px-3 py-2 font-mono text-xs" value={maxJob} onChange={(e) => setMaxJob(Number(e.target.value))} />
          </label>
          <label className="block">
            Max locked in total (USDC)
            <input type="number" min={1} className="mt-1 block w-full field px-3 py-2 font-mono text-xs" value={maxTotal} onChange={(e) => setMaxTotal(Number(e.target.value))} />
          </label>
        </div>
        {msg && <p className={msg.kind === "err" ? "text-danger" : "text-ink"}>{msg.text}</p>}
        <button
          className="btn btn-primary"
          disabled={busy || !valid}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              const { address, wallet } = await connectInjected(SITE_CHAIN);
              if (address.toLowerCase() !== owner.toLowerCase()) throw new Error(`Switch your wallet to ${short(owner)} (FUCI_SELLER_ADDRESS)`);
              const hash = await wallet.deployContract({
                abi: ESCROW_ABI,
                bytecode: ESCROW_BYTECODE,
                args: [ARC_USDC, treasury as `0x${string}`, 100, BigInt(Math.round(maxJob * 1e6)), BigInt(Math.round(maxTotal * 1e6))],
                account: address,
                chain: SITE_CHAIN,
              });
              await waitForReceipt(SITE_CHAIN, hash);
              if (await onDeployed(hash)) setMsg({ kind: "ok", text: "Escrow deployed. /escrow is live." });
            } catch (e) {
              setMsg({ kind: "err", text: walletError(e) });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Deploying… (check your wallet)" : "Deploy escrow"}
        </button>
      </div>
    </section>
  );
}
