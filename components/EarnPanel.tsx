"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { post, signed, type Owner } from "./OwnerTools";
import { errText } from "@/lib/browserWallet";

type Vault = { address: string; name: string; protocol: string; asset: "USDC" | "EURC"; apy: number; vaultFee: number; status: string; tvl: number; liquidity: number };
type Position = { vault: string; name: string; asset: "USDC" | "EURC"; apy: number; balance: number; principal: number; yield: number; feeOnWithdraw: number };
type State = { feePctOfYield: number; wallet: { usdc: number | null; eurc: number | null }; positions: Position[] };

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const money = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(2));

/** Owner-only: put the agent's idle USDC or EURC into an Earn vault on Arc, see what it earned, take it out. */
export function EarnPanel({ agent }: { agent: Owner }) {
  const [vaults, setVaults] = useState<Vault[] | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [pick, setPick] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchAll = useCallback(
    () =>
      Promise.all([
        fetch("/api/earn").then((r) => r.json()).catch(() => null),
        fetch(`/api/agent/${agent.id}/earn`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]),
    [agent.id],
  );
  const apply = useCallback(([v, s]: [{ vaults?: Vault[] } | null, State | null]) => {
    if (v?.vaults) {
      const list = v.vaults;
      setVaults(list);
      setPick((p) => p || list.find((x) => x.status === "active")?.address || "");
    }
    if (s?.wallet) setState(s);
  }, []);
  const load = useCallback(() => fetchAll().then(apply), [fetchAll, apply]);

  useEffect(() => {
    let live = true;
    fetchAll().then((r) => live && apply(r));
    return () => {
      live = false;
    };
  }, [fetchAll, apply]);

  const vault = vaults?.find((v) => v.address === pick);
  const have = vault ? (vault.asset === "EURC" ? state?.wallet.eurc : state?.wallet.usdc) : null;

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  const deposit = () =>
    run("deposit", async () => {
      const n = Math.floor(Number(amount) * 1e6) / 1e6;
      if (!vault) throw new Error("Pick a vault");
      if (!(n >= 0.1)) throw new Error("Deposit at least 0.10");
      const r = await post(`/api/agent/${agent.id}/earn`, { action: "deposit", vault: vault.address, amount: n, ...(await signed(agent, "earn-deposit", `${vault.address} ${n}`)) });
      setAmount("");
      return `Put ${r.amount} ${r.asset} into ${r.vault}. It starts earning now.`;
    });

  const withdraw = (p: Position) =>
    run(`w:${p.vault}`, async () => {
      const r = await post(`/api/agent/${agent.id}/earn`, { action: "withdraw", vault: p.vault, amount: "all", ...(await signed(agent, "earn-withdraw", `${p.vault} all`)) });
      return `Took ${r.amount} ${r.asset} back to the agent wallet${r.fee ? ` (Fuci fee ${r.fee} ${r.asset} on the yield)` : ""}.`;
    });

  const fee = state?.feePctOfYield ?? 10;

  return (
    <div className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Earn</p>
        <Link href="/earn" className="text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          All vaults and how it works →
        </Link>
      </div>
      <p className="mt-2 text-sm text-ink-2">
        Idle USDC or EURC in the agent wallet can earn yield in a lending vault on Arc (Circle Earn Kit). The vault holds it, not Fuci. Fuci takes {fee}% of the yield when you
        take it out, never the deposit.
      </p>

      {state && state.positions.length > 0 && (
        <ul className="mt-4 divide-y divide-line/60 rounded-md border border-line">
          {state.positions.map((p) => (
            <li key={p.vault} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{p.name}</span>
                <span className="ml-2 font-mono text-xs text-muted">{pct(p.apy)} APY</span>
              </span>
              <span className="font-mono tabular-nums">
                {p.balance.toFixed(4)} {p.asset}
              </span>
              <span className={`font-mono text-xs ${p.yield > 0 ? "text-up" : "text-muted"}`}>+{p.yield.toFixed(4)} earned</span>
              <button className="btn btn-ghost !px-3 !py-1 text-xs" disabled={busy !== null} onClick={() => withdraw(p)} title={p.feeOnWithdraw > 0 ? `Fuci fee on withdraw: ${p.feeOnWithdraw.toFixed(6)} ${p.asset}` : "No fee: nothing earned yet"}>
                {busy === `w:${p.vault}` ? "Taking out…" : "Take out"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="field min-w-0 flex-1 basis-full px-3 py-2 text-sm sm:basis-auto" aria-label="Vault">
          {!vaults && <option>Loading vaults…</option>}
          {vaults?.map((v) => (
            <option key={v.address} value={v.address} disabled={v.status !== "active"}>
              {v.name} · {v.asset} · {pct(v.apy)} APY · TVL {money(v.tvl)}
              {v.status !== "active" ? " · low liquidity" : ""}
            </option>
          ))}
        </select>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Amount" className="field w-28 px-3 py-2 text-sm" aria-label="Amount to deposit" />
        {have != null && have > 0 && (
          <button type="button" className="text-xs text-ink-2 underline hover:text-ink" onClick={() => setAmount(String(Math.floor((vault?.asset === "USDC" ? have - 0.05 : have) * 1e6) / 1e6))}>
            Max
          </button>
        )}
        <button className="btn btn-primary !py-2" disabled={busy !== null || !vault} onClick={deposit}>
          {busy === "deposit" ? "Depositing…" : "Deposit"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Agent wallet: {state?.wallet.usdc == null ? "…" : state.wallet.usdc.toFixed(2)} USDC · {state?.wallet.eurc == null ? "…" : state.wallet.eurc.toFixed(2)} EURC. Money in a vault isn&apos;t
        available to the autopilot until you take it out.
      </p>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-up" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
