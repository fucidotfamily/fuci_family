"use client";

import { useEffect, useState } from "react";
import { BuyUsdc } from "./BuyUsdc";
import { useRouter } from "next/navigation";
import { ERC8004, IDENTITY_ABI } from "@/lib/erc8004Abi";
import { FACTORY_ABI } from "@/lib/factoryArtifact";
import { SITE_CHAIN, connectInjected, errText, publicClient, sendInjected, sendPasskey, type Call } from "@/lib/browserWallet";

type Factory = { address: `0x${string}`; fee: string; feeUsdc: number } | null;

const USDC = "0x3600000000000000000000000000000000000000" as const;
const BALANCE = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const ERC20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/**
 * Put the agent on-chain. With the Fuci factory deployed: approve the fee (1 USDC) and call
 * createAgent, which pays the treasury and mints the ERC-8004 identity to the owner.
 * Without it: a direct ERC-8004 registration.
 */
export function RegisterIdentity({ id, name, owner, ownerKind, cardUri }: { id: string; name: string; owner: string; ownerKind: "browser" | "passkey"; cardUri: string }) {
  const router = useRouter();
  const [factory, setFactory] = useState<Factory | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/factory")
      .then((r) => r.json())
      .then((b) => setFactory(b.factory ?? null))
      .catch(() => setFactory(null));
  }, []);

  const create = async () => {
    setBusy("Check your wallet…");
    setError(null);
    try {
      let hash: `0x${string}`;
      if (factory) {
        const fee = BigInt(factory.fee);
        const createCall: Call = { address: factory.address, abi: FACTORY_ABI, functionName: "createAgent", args: [name, cardUri, fee] };
        const approveCall: Call = { address: USDC, abi: ERC20, functionName: "approve", args: [factory.address, fee] };
        if (ownerKind === "passkey") {
          ({ hash } = await sendPasskey(SITE_CHAIN, fee > 0n ? [approveCall, createCall] : [createCall]));
        } else {
          const { address } = await connectInjected(SITE_CHAIN);
          if (address.toLowerCase() !== owner.toLowerCase()) throw new Error(`Switch your wallet to the agent's owner ${owner.slice(0, 6)}…${owner.slice(-4)}`);
          // Fee plus a little gas (Arc gas is paid in USDC): stop before the wallet asks for anything.
          const balance = await publicClient(SITE_CHAIN).readContract({ address: USDC, abi: BALANCE, functionName: "balanceOf", args: [address] });
          if (balance < fee + 10_000n) throw new Error(`You need ${(Number(fee + 10_000n) / 1e6).toFixed(2)} USDC on Arc (the ${factory.feeUsdc} USDC fee plus a little gas). You have ${(Number(balance) / 1e6).toFixed(4)}.`);
          const allowance = await publicClient(SITE_CHAIN).readContract({ address: USDC, abi: ERC20, functionName: "allowance", args: [address, factory.address] });
          if (allowance < fee) {
            setBusy(`Approve ${factory.feeUsdc} USDC…`);
            await sendInjected(SITE_CHAIN, approveCall);
          }
          setBusy("Creating on-chain…");
          ({ hash } = await sendInjected(SITE_CHAIN, createCall));
        }
      } else {
        const call: Call = { address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "register", args: [cardUri] };
        if (ownerKind === "passkey") ({ hash } = await sendPasskey(SITE_CHAIN, [call]));
        else {
          const { address } = await connectInjected(SITE_CHAIN);
          if (address.toLowerCase() !== owner.toLowerCase()) throw new Error(`Switch your wallet to the agent's owner ${owner.slice(0, 6)}…${owner.slice(-4)}`);
          ({ hash } = await sendInjected(SITE_CHAIN, call));
        }
      }
      setBusy("Linking…");
      const res = await fetch("/api/spawn/identity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, txHash: hash }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Linking failed (${res.status})`);
      router.refresh();
    } catch (e) {
      const text = errText(e);
      setError(/insufficient|exceeds balance|transfer amount/i.test(text) && factory ? `You need ${factory.feeUsdc} USDC on Arc for the creation fee (plus a little for gas).` : text);
    } finally {
      setBusy(null);
    }
  };

  const fee = factory?.feeUsdc;
  return (
    <div className="space-y-2">
      <button className="btn btn-primary" disabled={busy !== null || factory === undefined} onClick={create}>
        {busy ?? (factory ? `Create on-chain · ${fee} USDC` : "Register on ERC-8004")}
      </button>
      <p className="text-xs text-muted">
        {factory
          ? `Mints your agent's identity on Arc (ERC-8004) to your wallet, so anyone can find and rate it. One-time ${fee} USDC creation fee, plus a little gas.`
          : "Puts this agent on-chain so anyone can find and rate it. Small USDC gas fee."}
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {error && /need .*USDC/i.test(error) && (
        <div className="flex flex-wrap items-center gap-2">
          <BuyUsdc target={{ address: owner }} label="No USDC? Buy it with a card" onSettled={() => setError(null)} />
        </div>
      )}
    </div>
  );
}
