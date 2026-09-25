import type { AgentCard } from "./store";
import { injected } from "./browserWallet";

/** Browser helpers for "my agent": one wallet owns one frond. */
const KEY = "fuci-owner";
const OFF = "fuci-disconnected";

export function rememberOwner(address: string) {
  try {
    localStorage.setItem(KEY, address);
    localStorage.removeItem(OFF);
  } catch {
    // private mode: the navbar just shows "Spawn agent"
  }
}

/** The wallet this browser used before: an already-authorised injected account (no prompt), else the last one remembered. */
export async function knownOwner(): Promise<string | null> {
  try {
    if (localStorage.getItem(OFF)) return null;
  } catch {
    // storage blocked: fall through to the wallet
  }
  const eth = injected();
  // The account the wallet currently exposes wins, so switching accounts switches the agent.
  if (eth) {
    const accounts = (await eth.request({ method: "eth_accounts" }).catch(() => [])) as string[];
    if (accounts[0]) return accounts[0];
  }
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function agentOfWallet(address: string): Promise<AgentCard | null> {
  const res = await fetch(`/api/agent/by-owner?address=${address}`, { cache: "no-store" });
  if (!res.ok) return null;
  return ((await res.json()) as { agent: AgentCard | null }).agent;
}

/** Disconnect this site from the wallet: forget it here and ask the wallet to drop the permission. */
export async function forgetOwner() {
  try {
    localStorage.removeItem(KEY);
    localStorage.setItem(OFF, "1");
  } catch {
    // nothing stored
  }
  // Supported by MetaMask and Rabby; other wallets ignore it (the flag above still applies).
  await injected()
    ?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
    .catch(() => undefined);
}
