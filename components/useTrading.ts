"use client";

import { useCallback, useEffect, useState } from "react";
import { parseUnits } from "viem";
import { post, signed, type Owner } from "./OwnerTools";
import { SITE_CHAIN, errText, sendInjected, sendPasskey, type Call } from "@/lib/browserWallet";
import { normalizeTrading, tradingDetail, type TradeRule, type Trading, type TradingSettings } from "@/lib/tradingRules";

export type PositionView = {
  token: string;
  symbol: string;
  amount: number;
  costUsdc: number;
  price: number | null;
  valueUsdc: number | null;
  pnlPct: number | null;
  /** False for a token that isn't on Argus (e.g. left from FOCI): it can only be withdrawn. */
  tradable: boolean;
  bonded: boolean;
};

type TradingState = { trading: Trading | null; positions: PositionView[]; spentToday: number; available: boolean };
type WalletState = { address: string; explorer: string; walletUsdc: number | null; gatewayUsdc: number | null } | null;

export const DEFAULT_TRADING: TradingSettings = { enabled: false, perTradeUsdc: 2, dailyUsdc: 10, slippagePct: 10, rules: [] };

const USDC = "0x3600000000000000000000000000000000000000";
const TRANSFER = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

/** The owner's trading state and actions for one agent, shared by the token card and the autopilot. */
export function useTrading(agent: Owner, mine: boolean) {
  const [state, setState] = useState<TradingState | null>(null);
  const [wallet, setWallet] = useState<WalletState>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; where: string } | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        fetch(`/api/agent/${agent.id}/trading`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch(`/api/agent/${agent.id}/automation`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]).then(([t, a]) => {
        if (t) setState(t);
        if (a) setWallet(a.wallet ?? null);
      }),
    [agent.id],
  );

  useEffect(() => {
    if (mine) load();
  }, [mine, load]);

  const settings = (): TradingSettings => {
    const t = state?.trading;
    return t ? { enabled: t.enabled, perTradeUsdc: t.perTradeUsdc, dailyUsdc: t.dailyUsdc, slippagePct: t.slippagePct, rules: t.rules } : DEFAULT_TRADING;
  };

  const act = async (label: string, where: string, fn: () => Promise<string>) => {
    setBusy(label);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn(), where });
      await load();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: errText(e), where });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const save = (next: TradingSettings, where = "autopilot", done?: string) =>
    act("save", where, async () => {
      const s = normalizeTrading(next);
      await post(`/api/agent/${agent.id}/trading`, { action: "save", settings: s, ...(await signed(agent, "set-trading", tradingDetail(s))) });
      return done ?? (s.enabled ? "Saved. The autopilot is on and checks every 5 minutes." : "Saved. The autopilot is off.");
    });

  const addOrder = (rule: TradeRule) => save({ ...settings(), rules: [...settings().rules, rule] }, "token", "Order placed. The autopilot checks it every 5 minutes (keep it On).");

  const buyNow = (token: string, usdc: number) =>
    act(`buy:${token}`, "token", async () => {
      const r = await post(`/api/agent/${agent.id}/trading`, { action: "buy", token, usdc, ...(await signed(agent, "buy", `${token.toLowerCase()} ${usdc}`)) });
      return `Bought $${r.symbol} for ${Number(r.usdc).toFixed(2)} USDC.`;
    });

  const sellNow = (token: string, pct = 100, where = "positions") =>
    act(`sell:${token}`, where, async () => {
      const t = token === "all" ? "all" : token.toLowerCase();
      const r = await post(`/api/agent/${agent.id}/trading`, { action: "sell", token: t, pct, ...(await signed(agent, "sell", `${t} ${pct}%`)) });
      return r.errors?.length ? `Sold ${r.sold}. Failed: ${r.errors.join("; ")}` : t === "all" ? "Sold everything." : "Sold.";
    });

  const fund = (usdc: number) =>
    act("fund", "wallet", async () => {
      if (!wallet) throw new Error("Save the autopilot once to create the agent wallet");
      const call: Call = { address: USDC, abi: TRANSFER, functionName: "transfer", args: [wallet.address, parseUnits(String(usdc), 6)] };
      if (agent.ownerKind === "passkey") await sendPasskey(SITE_CHAIN, [call]);
      else await sendInjected(SITE_CHAIN, call);
      return `Sent ${usdc} USDC to the agent.`;
    });

  const withdraw = () =>
    act("withdraw", "wallet", async () => {
      const r = await post(`/api/agent/${agent.id}/automation`, { action: "withdraw", ...(await signed(agent, "withdraw", "all to owner")) });
      return r.nothing ? "Nothing to withdraw yet: the agent wallet is empty." : "Done. The agent's USDC and tokens are back in your wallet.";
    });

  return { agentId: agent.id, state, wallet, busy, msg, load, settings, save, addOrder, buyNow, sellNow, fund, withdraw };
}

export type TradingOps = ReturnType<typeof useTrading>;
