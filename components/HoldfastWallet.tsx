"use client";

import { useEffect, useState } from "react";
import { createPublicClient, formatUnits, http, numberToHex, parseAbiItem, type Transport } from "viem";
import { arc, arcTestnet } from "viem/chains";
import { walletError } from "@/lib/browserWallet";

/**
 * Holdfast = the human owner's wallet. Two real options:
 *  - Browser wallet (MetaMask, Rabby, …) via EIP-1193, switched to Arc.
 *  - Circle Modular Wallet (passkey smart account) when NEXT_PUBLIC_CIRCLE_CLIENT_KEY is set.
 */

const CLIENT_KEY = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY ?? "";
// Circle's standard Modular Wallets endpoint; only the client key is per-account.
const CLIENT_URL = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL || "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
const TESTNET = process.env.NEXT_PUBLIC_ARC_NETWORK === "testnet";
const CHAIN = TESTNET ? arcTestnet : arc;
const CHAIN_PATH = TESTNET ? "arcTestnet" : "arc";
const USDC = "0x3600000000000000000000000000000000000000";
const STORAGE_KEY = "fuci-holdfast-credential";

export const PASSKEY_ENABLED = Boolean(CLIENT_KEY);

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
const injected = () => (typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Eip1193 }).ethereum);

export type Holdfast = {
  address: `0x${string}`;
  kind: "browser" | "passkey";
  /** Sign a plain-text message with this wallet (browser wallets only). */
  signMessage?: (message: string) => Promise<`0x${string}`>;
};

async function connectBrowser(): Promise<Holdfast> {
  const eth = injected();
  if (!eth) throw new Error("No browser wallet found. Install MetaMask or Rabby, or use a passkey.");
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
  if (!address) throw new Error("No account was shared");
  const chainId = numberToHex(CHAIN.id);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: CHAIN.name,
          nativeCurrency: CHAIN.nativeCurrency,
          rpcUrls: CHAIN.rpcUrls.default.http,
          blockExplorerUrls: CHAIN.blockExplorers ? [CHAIN.blockExplorers.default.url] : [],
        },
      ],
    });
  }
  return {
    address,
    kind: "browser",
    signMessage: async (message) => (await eth.request({ method: "personal_sign", params: [message, address] })) as `0x${string}`,
  };
}

async function connectPasskey(mode: "register" | "login", username?: string): Promise<Holdfast> {
  const mw = await import("@circle-fin/modular-wallets-core");
  const { toWebAuthnAccount } = await import("viem/account-abstraction");

  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  const credential =
    mode === "login" && saved
      ? JSON.parse(saved)
      : await mw.toWebAuthnCredential({
          transport: mw.toPasskeyTransport(CLIENT_URL, CLIENT_KEY),
          mode: mode === "register" ? mw.WebAuthnMode.Register : mw.WebAuthnMode.Login,
          username,
        });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credential));
  } catch {
    // not persisted; the passkey still works next time via "login"
  }
  // The Circle SDK bundles its own viem copy; the casts bridge the duplicate type identities.
  const transport = mw.toModularTransport(`${CLIENT_URL}/${CHAIN_PATH}`, CLIENT_KEY) as unknown as Transport;
  const client = createPublicClient({ chain: CHAIN, transport });
  type SmartAccountParams = Parameters<typeof mw.toCircleSmartAccount>[0];
  const account = await mw.toCircleSmartAccount({
    client: client as unknown as SmartAccountParams["client"],
    owner: toWebAuthnAccount({ credential }) as unknown as SmartAccountParams["owner"],
  });
  return { address: account.address, kind: "passkey" };
}

async function usdcBalance(address: `0x${string}`) {
  const client = createPublicClient({ chain: CHAIN, transport: http() });
  // Arc exposes native USDC through an ERC-20 interface with 6 decimals.
  const raw = await client.readContract({ address: USDC, abi: [parseAbiItem("function balanceOf(address) view returns (uint256)")], functionName: "balanceOf", args: [address] });
  return Number(formatUnits(raw, 6));
}

export function HoldfastWallet({ onReady }: { onReady: (h: Holdfast) => void }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holdfast, setHoldfast] = useState<Holdfast | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!holdfast) return;
    usdcBalance(holdfast.address).then(setBalance).catch(() => setBalance(null));
  }, [holdfast]);

  const run = async (label: string, fn: () => Promise<Holdfast>) => {
    setBusy(label);
    setError(null);
    try {
      const h = await fn();
      setHoldfast(h);
      onReady(h);
    } catch (e) {
      setError(walletError(e));
    } finally {
      setBusy(null);
    }
  };

  if (holdfast) {
    return (
      <div className="rounded-md border border-ink bg-surface-2 p-4">
        <p className="text-sm text-muted">{holdfast.kind === "passkey" ? "Circle passkey wallet" : "Browser wallet"} · {CHAIN.name}</p>
        <p className="mt-1 break-all font-mono text-sm">{holdfast.address}</p>
        <p className="mt-2 text-sm text-ink-2">
          USDC balance: <span className="font-mono">{balance === null ? "…" : balance.toFixed(2)}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <button className="btn btn-primary" disabled={busy !== null} onClick={() => run("browser", connectBrowser)}>
          {busy === "browser" ? "Check your wallet…" : "Connect wallet"}
        </button>
      </div>

      {PASSKEY_ENABLED && (
        <div className="space-y-3 border-t border-line pt-5">
          <label className="block text-sm text-ink-2" htmlFor="hf-name">
            Or use a passkey
          </label>
          <input
            id="hf-name"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32))}
            placeholder="passkey name, e.g. tidepool-ana"
            className="w-full field px-4 py-2.5"
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-ghost"
              disabled={busy !== null || !username}
              onClick={() => run("register", () => connectPasskey("register", username))}
            >
              {busy === "register" ? "Waiting for passkey…" : "Create passkey wallet"}
            </button>
            <button className="btn btn-ghost" disabled={busy !== null} onClick={() => run("login", () => connectPasskey("login"))}>
              {busy === "login" ? "Waiting for passkey…" : "I already have one"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
