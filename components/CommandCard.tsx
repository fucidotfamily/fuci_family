"use client";

import { useState } from "react";
import { post, signed, type Owner } from "./OwnerTools";
import type { TradingOps } from "./useTrading";
import type { Command } from "@/lib/intent";
import type { TradeRule } from "@/lib/tradingRules";
import { errText } from "@/lib/browserWallet";

export type Proposal = { kind: "action"; command: Command; summary: string; note?: string };

/**
 * A command the owner typed, shown before anything happens. Confirm signs it with the owner's wallet
 * and runs it through the same endpoints as the buttons elsewhere on the page.
 */
export function CommandCard({ agent, ops, proposal }: { agent: Owner; ops: TradingOps; proposal: Proposal }) {
  const [state, setState] = useState<"ready" | "busy" | "done" | "cancelled">("ready");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const c = proposal.command;

  const run = async (): Promise<string> => {
    switch (c.type) {
      case "earn_deposit": {
        const r = await post(`/api/agent/${agent.id}/earn`, { action: "deposit", vault: c.vault, amount: c.amount, ...(await signed(agent, "earn-deposit", `${c.vault} ${c.amount}`)) });
        return `Done: ${r.amount} ${r.asset} is in ${r.vault} and earning.`;
      }
      case "earn_withdraw": {
        const vaults = c.vault
          ? [c.vault]
          : (((await fetch(`/api/agent/${agent.id}/earn`, { cache: "no-store" }).then((r) => r.json())) as { positions?: { vault: string }[] }).positions ?? []).map((p) => p.vault);
        let got = 0;
        for (const v of vaults) {
          const r = await post(`/api/agent/${agent.id}/earn`, { action: "withdraw", vault: v, amount: "all", ...(await signed(agent, "earn-withdraw", `${v} all`)) });
          got += Number(r.amount) || 0;
        }
        return `Done: ${got.toFixed(4)} is back in the agent wallet.`;
      }
      case "dca_add": {
        const s = ops.settings();
        const rule = { id: `d${Date.now().toString(36).slice(-6)}`, kind: "dca", token: c.token, usdc: c.usdc, everyHours: c.everyHours, totalUsdc: c.totalUsdc, hold: c.hold } as TradeRule;
        const rules = [...s.rules.filter((r) => !(r.kind === "dca" && r.token.toLowerCase() === c.token.toLowerCase())), rule];
        const perDay = Math.ceil(c.usdc * (24 / c.everyHours));
        const ok = await ops.save(
          { ...s, enabled: true, rules, perTradeUsdc: Math.min(100, Math.max(s.perTradeUsdc, c.usdc)), dailyUsdc: Math.min(1000, Math.max(s.dailyUsdc, perDay)) },
          "command",
          "Done: the DCA plan is saved and the autopilot is on.",
        );
        if (!ok) throw new Error("Couldn't save the plan. See the message below.");
        return "Done: the DCA plan is saved and the autopilot is on.";
      }
      case "dca_stop": {
        const s = ops.settings();
        const rules = s.rules.filter((r) => !(r.kind === "dca" && (!c.token || r.token.toLowerCase() === c.token.toLowerCase())));
        if (!(await ops.save({ ...s, rules }, "command"))) throw new Error("Couldn't save. See the message below.");
        return "Done: that DCA plan is stopped.";
      }
      case "autopilot":
        if (!(await ops.save({ ...ops.settings(), enabled: c.on }, "command"))) throw new Error("Couldn't save. See the message below.");
        return c.on ? "Done: the autopilot is on and checks every 5 minutes." : "Done: the autopilot is off.";
      case "sell":
        if (!(await ops.sellNow(c.token, c.pct, "command"))) throw new Error("The sale didn't go through. See the message below.");
        return "Done: sold.";
      case "buy":
        if (!(await ops.buyNow(c.token, c.usdc))) throw new Error("The buy didn't go through. See the message in the token card.");
        return "Done: bought.";
    }
  };

  const confirm = async () => {
    setState("busy");
    setMsg(null);
    try {
      setMsg({ ok: true, text: await run() });
      setState("done");
      void ops.load();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
      setState("ready");
    }
  };

  return (
    <div className="rounded-2xl rounded-tl-md border border-up/50 bg-up/5 p-4">
      <p className="text-xs uppercase tracking-widest text-up">Your agent will</p>
      <p className="mt-1 font-semibold text-ink">{proposal.summary}</p>
      {proposal.note && <p className="mt-1 text-xs text-ink-2">{proposal.note}</p>}
      {state !== "done" && state !== "cancelled" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn btn-primary !py-2" disabled={state === "busy"} onClick={confirm}>
            {state === "busy" ? "Check your wallet…" : "Confirm"}
          </button>
          <button className="btn btn-ghost !py-2" disabled={state === "busy"} onClick={() => setState("cancelled")}>
            Cancel
          </button>
          <span className="text-xs text-muted">You sign it with your wallet. Nothing moves before that.</span>
        </div>
      )}
      {state === "cancelled" && <p className="mt-2 text-sm text-muted">Cancelled. Nothing was done.</p>}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-up" : "text-danger"}`}>{msg.text}</p>}
      {ops.msg && !ops.msg.ok && (ops.msg.where === "command" || ops.msg.where === "token") && <p className="mt-2 text-sm text-danger">{ops.msg.text}</p>}
    </div>
  );
}
