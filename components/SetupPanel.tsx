"use client";

import { useEffect, useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CopyButton } from "./CopyButton";
import { setupMessage } from "@/lib/setupMessage";
import { FACTORY_ABI, FACTORY_BYTECODE } from "@/lib/factoryArtifact";
import { ERC8004 } from "@/lib/erc8004Abi";
import { SITE_CHAIN, connectInjected, publicClient } from "@/lib/browserWallet";
import { FUCI_TREASURY } from "@/lib/config";

type Env = Record<string, boolean>;
type Info = { network: string; mode: "self-managed" | "circle" | "none"; owner: string | null; circleKey: boolean; env: Env };
type Status = Info & {
  authed: boolean;
  agent: { address: string; explorer: string; walletUsdc: number | null; gatewayUsdc: number | null } | null;
  seller: { address: string; explorer: string } | null;
  erc8004?: {
    agentId: number | null;
    explorer: string | null;
    uri: string | null;
    validator: { address: string; explorer: string; gasUsdc: number | null } | null;
  };
  automation?: { tickUrl: string; secret: string; qstash: boolean } | null;
  factory?: { address: string; feeUsdc: number; treasury: string; owner: string; agentsCreated: number } | null;
  trading?: { feesUsdc: number; treasury: string | null } | null;
};
type Auth = { wallet: { address: string; issuedAt: number; signature: string } };

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
const injected = () => (window as unknown as { ethereum?: Eip1193 }).ethereum;

async function connectWallet(): Promise<string> {
  const eth = injected();
  if (!eth) throw new Error("No browser wallet found. Install Rabby or MetaMask.");
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!address) throw new Error("No account was shared");
  return address;
}

const ENV_INFO: Record<string, { label: string; required?: boolean }> = {
  FUCI_SELLER_ADDRESS: { label: "Your wallet address. It receives x402 payments and signs you in here", required: true },
  AGENT_PRIVATE_KEY: { label: "The house agent's key (generated in step 2)", required: true },
  UPSTASH: { label: "Upstash Redis (required for stats and spawning; one click in Vercel → Storage)", required: true },
  NEXT_PUBLIC_CIRCLE_CLIENT_KEY: { label: "Circle Client Key (optional). Passkey wallets on /spawn" },
  NEXT_PUBLIC_FUCI_TOKEN: { label: "$FUCI token address (optional). Set it after the Argus launch" },
  NEXT_PUBLIC_TITHE_ADDRESS: { label: "Kelp restoration tithe wallet (optional)" },
  QSTASH_TOKEN: { label: "QSTASH_TOKEN (optional). Runs agent automations every 5 minutes (Upstash console → QStash). Without it, use any cron service with the tick URL on this page" },
  X_CLIENT: { label: "X_CLIENT_ID + X_CLIENT_SECRET (optional). Lets agent owners connect their X account (callback: https://www.fuci.family/api/x/callback)" },
  ONRAMP_API_KEY: { label: "Circle Onramp kit key (optional, Circle Console → kit keys). Turns on \"Buy USDC with card\" (debit card, Apple Pay, Google Pay) for agent wallets and on-chain creation. Production by default: real money" },
  ANTHROPIC_API_KEY: { label: "Anthropic key (optional). Claude writes agent answers; without it they are built from the data" },
};

export function SetupPanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [myAddress, setMyAddress] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ key: string; address: string } | null>(null);
  const [amount, setAmount] = useState(1);
  const [treasury, setTreasury] = useState("");

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setMsg({ kind: "err", text: "Could not load the setup status." }));
  }, []);

  const post = async (action: string, a: Auth | null = auth, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(a ?? {}), ...extra }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      return body;
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const signIn = async () => {
    setBusy("signin");
    setMsg(null);
    try {
      const address = await connectWallet();
      const issuedAt = Date.now();
      const signature = (await injected()!.request({ method: "personal_sign", params: [setupMessage(address, issuedAt), address] })) as string;
      const a: Auth = { wallet: { address, issuedAt, signature } };
      setBusy(null);
      const s = await post("status", a);
      if (s) {
        setAuth(a);
        setStatus(s);
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
      setBusy(null);
    }
  };

  const refresh = async () => {
    const s = await post("status");
    if (s) setStatus(s);
  };

  if (!info) return <p className="text-muted">{msg?.text ?? "Loading…"}</p>;
  const env = status?.env ?? info.env;
  const agent = status?.agent;

  return (
    <div className="space-y-4">
      {msg && <p className={`card p-4 text-sm ${msg.kind === "err" ? "text-danger" : "text-ink"}`}>{msg.text}</p>}

      {/* Step 1: owner wallet */}
      <section className="card p-6">
        <p className="eyebrow">Step 1 · Your wallet</p>
        {info.owner ? (
          <p className="mt-3 text-ink-2">
            ✓ Payments go to <span className="break-all font-mono text-sm text-ink">{info.owner}</span>
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-ink-2">
              Connect the wallet that should receive payments (e.g. Rabby). Add its address in Vercel as{" "}
              <code className="text-ink">FUCI_SELLER_ADDRESS</code>. It is also how you sign in here.
            </p>
            {myAddress ? (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-3 py-2 font-mono text-xs">{myAddress}</code>
                <CopyButton text={myAddress} />
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    setMyAddress(await connectWallet());
                  } catch (e) {
                    setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
                  }
                }}
              >
                Connect wallet
              </button>
            )}
          </div>
        )}
      </section>

      {/* Step 2: agent key */}
      <section className="card p-6">
        <p className="eyebrow">Step 2 · Agent wallet</p>
        {info.mode === "self-managed" ? (
          <p className="mt-3 text-ink-2">✓ Agent key is set. Its address appears after you sign in below.</p>
        ) : newKey ? (
          <div className="mt-3 space-y-3 text-ink-2">
            <p>
              Add this in Vercel → Settings → Environment Variables as <code className="text-ink">AGENT_PRIVATE_KEY</code>, then redeploy. It was
              generated in your browser and was never sent anywhere. It is shown <b>only once</b>, so keep a copy somewhere safe.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-3 py-2 font-mono text-xs">{newKey.key}</code>
              <CopyButton text={newKey.key} />
            </div>
            <p className="text-sm">
              Agent address: <span className="break-all font-mono text-ink">{newKey.address}</span>
            </p>
            <p className="text-xs text-muted">
              This key only needs a small balance: the agent spends fractions of a cent per call. Never put large amounts in it.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-ink-2">
              The house agent pays for tools with its own wallet through Circle Gateway. That is permissionless, so no Circle account or API key is
              needed. Generate a fresh key in your browser:
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                const key = generatePrivateKey();
                setNewKey({ key, address: privateKeyToAccount(key).address });
              }}
            >
              Generate agent key
            </button>
          </div>
        )}
      </section>

      {/* Step 3: sign in + fund */}
      <section className="card p-6">
        <p className="eyebrow">Step 3 · Fund the agent</p>
        {info.mode === "none" || !info.owner ? (
          <p className="mt-3 text-ink-2">Available once FUCI_SELLER_ADDRESS and AGENT_PRIVATE_KEY are set and the site is redeployed.</p>
        ) : !status ? (
          <div className="mt-3 space-y-3">
            <p className="text-ink-2">Sign a message with the wallet {short(info.owner)} to manage the agent. There is no transaction and no gas.</p>
            <button className="btn btn-primary" disabled={busy !== null} onClick={signIn}>
              {busy === "signin" || busy === "status" ? "Check your wallet…" : "Sign in with wallet"}
            </button>
          </div>
        ) : agent ? (
          <div className="mt-3 space-y-3 text-ink-2">
            <p>
              Agent:{" "}
              <a href={agent.explorer} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-ink underline">
                {agent.address}
              </a>
            </p>
            <p className="text-sm">
              Wallet: <b className="font-mono">{fmt(agent.walletUsdc)} USDC</b> · Gateway: <b className="font-mono">{fmt(agent.gatewayUsdc)} USDC</b>
            </p>
            <div className="rounded bg-surface-2 p-3 text-xs">
              <b>1.</b> Send USDC on the <b>Arc</b> network to the agent address (from Rabby or an exchange). USDC is also Arc&apos;s gas, so no
              other token is needed.
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono">{agent.address}</code>
                <CopyButton text={agent.address} />
              </div>
              <p className="mt-2">
                <b>2.</b> Move part of it into Circle Gateway. x402 payments are drawn from the Gateway balance, gas-free.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="deposit-amount">
                Deposit amount
              </label>
              <input
                id="deposit-amount"
                type="number"
                min={0.1}
                max={50}
                step={0.1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-24 field px-3 py-1.5 font-mono text-sm"
              />
              <button
                className="btn btn-primary"
                disabled={busy !== null || !(amount > 0)}
                onClick={async () => {
                  const r = await post("deposit", auth, { amount });
                  if (r) {
                    setMsg({ kind: "ok", text: `${r.amount} USDC deposited to Gateway. The agent is ready to pay.` });
                    refresh();
                  }
                }}
              >
                {busy === "deposit" ? "Depositing… (~30s)" : "Deposit to Gateway"}
              </button>
              <button className="btn btn-ghost" disabled={busy !== null} onClick={refresh}>
                Refresh
              </button>
            </div>
            {status.seller && (
              <p className="text-xs text-muted">
                Tool payments go to: <span className="break-all font-mono">{status.seller.address}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-danger">The agent wallet could not be loaded. Check AGENT_PRIVATE_KEY in Vercel.</p>
        )}
      </section>

      {/* Step 4: on-chain identity */}
      {status?.erc8004 && agent && (
        <section className="card p-6">
          <p className="eyebrow">Step 4 · On-chain identity (ERC-8004)</p>
          <div className="mt-3 space-y-3 text-ink-2">
            {status.erc8004.agentId === null ? (
              <>
                <p>
                  Register the house agent in Arc&apos;s ERC-8004 Identity Registry. It mints an agent NFT pointing at{" "}
                  <a className="underline" href="/.well-known/agent-card.json">
                    /.well-known/agent-card.json
                  </a>
                  . The agent wallet pays a little USDC gas.
                </p>
                <button
                  className="btn btn-primary"
                  disabled={busy !== null}
                  onClick={async () => {
                    const r = await post("register-identity");
                    if (r) {
                      setMsg({ kind: "ok", text: `Registered as ERC-8004 agent #${r.agentId}.` });
                      refresh();
                    }
                  }}
                >
                  {busy === "register-identity" ? "Registering…" : "Register house agent"}
                </button>
              </>
            ) : (
              <p>
                ✓ House agent is{" "}
                <a className="font-mono text-ink underline" href={status.erc8004.explorer ?? "#"} target="_blank" rel="noreferrer">
                  ERC-8004 #{status.erc8004.agentId}
                </a>
              </p>
            )}
            {status.erc8004.validator && (
              <div className="rounded bg-surface-2 p-3 text-xs">
                <p>
                  <b>Tide checker</b> (Fuci&apos;s re-execution validator, key derived from the agent key):{" "}
                  <a className="break-all font-mono underline" href={status.erc8004.validator.explorer} target="_blank" rel="noreferrer">
                    {status.erc8004.validator.address}
                  </a>
                </p>
                <p className="mt-1">
                  Gas: <b className="font-mono">{fmt(status.erc8004.validator.gasUsdc)} USDC</b>. Each validation response costs a fraction of a cent.
                </p>
                <button
                  className="btn btn-ghost mt-2 !py-1.5"
                  disabled={busy !== null}
                  onClick={async () => {
                    const r = await post("fund-validator", auth, { amount: 0.05 });
                    if (r) {
                      setMsg({ kind: "ok", text: `Sent ${r.amount} USDC to the validator.` });
                      refresh();
                    }
                  }}
                >
                  {busy === "fund-validator" ? "Sending…" : "Send 0.05 USDC to validator"}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Step 5: automation scheduler */}
      {status?.automation && (
        <section className="card p-6">
          <p className="eyebrow">Step 5 · Automation scheduler</p>
          <div className="mt-3 space-y-3 text-sm text-ink-2">
            <p>Agents with automation on run when this URL is called. Call it every 5 minutes.</p>
            {status.automation.qstash ? (
              <button
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={async () => {
                  const r = await post("scheduler");
                  if (r) setMsg({ kind: "ok", text: `Scheduler running every ${r.every}.` });
                }}
              >
                {busy === "scheduler" ? "Starting…" : "Start scheduler (QStash)"}
              </button>
            ) : (
              <p className="text-xs text-muted">Add QSTASH_TOKEN for one-click setup, or use any cron service (e.g. cron-job.org) with:</p>
            )}
            <div className="space-y-2 rounded bg-surface-2 p-3 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-muted">POST</span>
                <code className="min-w-0 flex-1 truncate">{status.automation.tickUrl}</code>
                <CopyButton text={status.automation.tickUrl} />
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-muted">Header</span>
                <code className="min-w-0 flex-1 truncate">Authorization: Bearer {status.automation.secret.slice(0, 8)}…</code>
                <CopyButton text={`Bearer ${status.automation.secret}`} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Step 6: agent factory (1 USDC to create an agent on-chain) */}
      {status && info.owner && (
        <section className="card p-6">
          <p className="eyebrow">Step 6 · Agent factory</p>
          {status.factory ? (
            <div className="mt-3 space-y-1 text-sm text-ink-2">
              <p>
                ✓ Live at{" "}
                <a className="break-all font-mono text-ink underline" href={`${SITE_CHAIN.blockExplorers?.default.url}/address/${status.factory.address}`} target="_blank" rel="noreferrer">
                  {status.factory.address}
                </a>
              </p>
              <p>
                Fee <b className="font-mono">{status.factory.feeUsdc} USDC</b> → treasury <span className="break-all font-mono">{status.factory.treasury}</span>
              </p>
              <p>
                Agents created: <b className="font-mono">{status.factory.agentsCreated}</b> · earned{" "}
                <b className="font-mono">{(status.factory.agentsCreated * status.factory.feeUsdc).toFixed(2)} USDC</b>
              </p>
              {status.factory.treasury.toLowerCase() === FUCI_TREASURY.toLowerCase() ? (
                <p className="text-up">✓ Fees go to the Fuci Safe.</p>
              ) : (
                <div className="mt-3 rounded border border-line p-3">
                  <p>
                    Send creation fees to the Fuci Safe <span className="break-all font-mono">{FUCI_TREASURY}</span> (calls <code>setTreasury</code> from the
                    factory owner).
                  </p>
                  <button
                    className="btn btn-primary mt-2 !py-2"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy("treasury");
                      setMsg(null);
                      try {
                        const { address, wallet } = await connectInjected(SITE_CHAIN);
                        if (address.toLowerCase() !== status.factory!.owner.toLowerCase()) throw new Error(`Switch your wallet to the factory owner ${short(status.factory!.owner)}`);
                        const hash = await wallet.writeContract({
                          address: status.factory!.address as `0x${string}`,
                          abi: FACTORY_ABI,
                          functionName: "setTreasury",
                          args: [FUCI_TREASURY],
                          account: address,
                          chain: SITE_CHAIN,
                        });
                        await publicClient(SITE_CHAIN).waitForTransactionReceipt({ hash });
                        setMsg({ kind: "ok", text: "Done. Creation fees now go to the Fuci Safe." });
                        refresh();
                      } catch (e) {
                        setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {busy === "treasury" ? "Confirm in your wallet…" : "Use the Fuci Safe as treasury"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-3 text-sm text-ink-2">
              <p>
                Deploy FuciAgentFactory from your wallet. After that, putting an agent on-chain costs 1 USDC, paid straight to your treasury, and emits{" "}
                <code className="font-mono text-ink">AgentCreated</code> (what DefiLlama counts). You own it: you can change the fee (max 100 USDC) or the
                treasury later.
              </p>
              <label className="block">
                Treasury (receives the fees)
                <input
                  className="mt-1 block w-full field px-3 py-2 font-mono text-xs"
                  placeholder={info.owner}
                  value={treasury}
                  onChange={(e) => setTreasury(e.target.value.trim())}
                />
              </label>
              <button
                className="btn btn-primary"
                disabled={busy !== null || (treasury !== "" && !/^0x[0-9a-fA-F]{40}$/.test(treasury))}
                onClick={async () => {
                  setBusy("deploy");
                  setMsg(null);
                  try {
                    const { address, wallet } = await connectInjected(SITE_CHAIN);
                    if (address.toLowerCase() !== info.owner!.toLowerCase()) throw new Error(`Switch your wallet to ${short(info.owner!)} (FUCI_SELLER_ADDRESS)`);
                    const hash = await wallet.deployContract({
                      abi: FACTORY_ABI,
                      bytecode: FACTORY_BYTECODE,
                      args: ["0x3600000000000000000000000000000000000000", ERC8004.identity, (treasury || info.owner) as `0x${string}`, 1_000_000n],
                      account: address,
                      chain: SITE_CHAIN,
                    });
                    await publicClient(SITE_CHAIN).waitForTransactionReceipt({ hash });
                    setBusy(null);
                    const r = await post("set-factory", auth, { txHash: hash });
                    if (r) {
                      setMsg({ kind: "ok", text: `Factory deployed at ${r.factory.address}. Creating an agent on-chain now costs 1 USDC.` });
                      refresh();
                    }
                  } catch (e) {
                    setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "deploy" ? "Deploying… (check your wallet)" : "Deploy factory"}
              </button>
            </div>
          )}
        </section>
      )}

      {status?.authed && status.trading && (
        <section className="card p-6">
          <p className="eyebrow">Trading fees</p>
          <p className="mt-3 text-sm text-ink-2">
            Agents on autopilot pay 1% of every trade to{" "}
            <span className="break-all font-mono">{status.trading.treasury ?? "no treasury yet (set FUCI_TREASURY or deploy the factory)"}</span>. Earned so far:{" "}
            <b className="font-mono">{status.trading.feesUsdc.toFixed(2)} USDC</b>
          </p>
        </section>
      )}

      {/* Checklist */}
      <section className="card p-6">
        <p className="eyebrow">Vercel variables checklist</p>
        <ul className="mt-4 space-y-2 text-sm">
          {Object.entries(ENV_INFO).map(([k, meta]) => (
            <li key={k} className="flex gap-3">
              <span className={env[k] ? "text-up" : meta.required ? "text-danger" : "text-muted"}>{env[k] ? "✓" : meta.required ? "✗" : "○"}</span>
              <span>
                <code className="font-mono text-xs">{k === "UPSTASH" ? "Upstash (automatic)" : k}</code>
                <span className="block text-ink-2">{meta.label}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          After changing variables in Vercel, redeploy. Live status:{" "}
          <a className="underline" href="/api/health">
            /api/health
          </a>
        </p>
      </section>
    </div>
  );
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmt = (n: number | null) => (n === null ? "?" : n.toFixed(4));
