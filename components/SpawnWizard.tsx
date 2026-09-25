"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HoldfastWallet, type Holdfast } from "./HoldfastWallet";
import { spawnMessage } from "@/lib/spawnMessage";
import { agentOfWallet, rememberOwner } from "@/lib/myAgent";
import { slugOf } from "@/lib/slug";
import { walletError } from "@/lib/browserWallet";
import type { AgentCard } from "@/lib/store";

type StrategyId = "scout" | "watcher" | "oracle" | "custom";

// A custom agent may use every tool: the worst case is all three.
const CUSTOM_COST = 0.0035;
const MAX_MISSION = 280;

const STRATEGIES: {
  id: Exclude<StrategyId, "custom">;
  name: string;
  cost: number;
  tagline: string;
  does: string;
  example: string;
  buys: string[];
  icon: React.ReactNode;
}[] = [
  {
    id: "scout",
    name: "Launch Scout",
    cost: 0.001,
    tagline: "First to know about new tokens",
    does: "Checks the Argus launchpad for new tokens and reports who launched them and their buy and sell tax.",
    example: "New on Argus: $MIND by 0x0ecd…4b35, 3% buy / 3% sell tax.",
    buys: ["Argus launches"],
    icon: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  },
  {
    id: "watcher",
    name: "Bonding Watcher",
    cost: 0.003,
    tagline: "Catches tokens about to bond",
    does: "Follows the newest Argus launch: price, taxes, progress to bonding and the latest buys and sells.",
    example: "$MIND is 64% of the way to bonding, 6 buys in the last hour.",
    buys: ["Argus launches", "Bonding progress"],
    icon: <><path d="M3 20h18" /><path d="M5 16l4-5 3 3 6-8" /><path d="M15 6h3v3" /></>,
  },
  {
    id: "oracle",
    name: "Tide Oracle",
    cost: 0.0005,
    tagline: "The market mood in one line",
    does: "Reads the net USDC flow across the latest Argus launches and sums it up: flood, rising, slack or ebb tide.",
    example: "Rising tide: +1,240 USDC net across 38 trades; $MIND leads at 64% to bonding.",
    buys: ["Tide reading"],
    icon: <><path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0" /><path d="M2 17c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0" /><path d="M12 3v5" /></>,
  },
];

const BUDGETS = [0.1, 0.5, 1, 5, 25];
const MAX_BUDGET = 100;

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/** Signing time for the spawn message (kept outside render). */
const timestamp = () => Date.now();

const fmtUsd = (n: number) => (n >= 1 ? n.toFixed(2) : n.toFixed(n >= 0.1 ? 2 : 4)).replace(/\.?0+$/, "") || "0";

export function SpawnWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [holdfast, setHoldfast] = useState<Holdfast | null>(null);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState(1);
  const [strategy, setStrategy] = useState<StrategyId>("scout");
  const [mission, setMission] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<AgentCard | null>(null);
  const [checking, setChecking] = useState(false);

  // One wallet, one agent: a wallet that already owns a frond goes to its profile.
  const onWallet = async (h: Holdfast) => {
    setHoldfast(h);
    rememberOwner(h.address);
    setChecking(true);
    const mine = await agentOfWallet(h.address).catch(() => null);
    setChecking(false);
    window.dispatchEvent(new Event("fuci:owner"));
    if (mine) {
      setExisting(mine);
      router.push(`/agent/${mine.id}`);
    }
  };

  const spawn = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!holdfast) throw new Error("Connect a wallet first");
      const payload = { name: name.trim(), strategy, ...(strategy === "custom" && mission.trim() ? { mission: mission.replace(/\s+/g, " ").trim().slice(0, MAX_MISSION) } : {}), dailyLimitUsdc: Number(limit.toFixed(2)), owner: holdfast.address, issuedAt: timestamp() };
      // Browser wallets prove ownership with a signature; passkey wallets are created in this session.
      const signature = holdfast.signMessage ? await holdfast.signMessage(spawnMessage(payload)) : undefined;
      const res = await fetch("/api/spawn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, ownerKind: holdfast.kind, signature }),
      });
      const body = await res.json();
      if (res.status === 409 && body.agent) {
        router.push(`/agent/${body.agent.id}`);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Could not spawn");
      router.push(`/agent/${body.id}`);
    } catch (e) {
      setError(walletError(e));
      setBusy(false);
    }
  };

  const steps = ["Wallet", "Strategy", "Budget", "Name"];
  const chosen = strategy === "custom" ? { name: mission.trim() ? "Custom agent" : "General agent", cost: CUSTOM_COST } : STRATEGIES.find((x) => x.id === strategy)!;
  const runsPerDay = Math.floor(limit / chosen.cost);
  const every5min = 288 * chosen.cost;
  const validLimit = limit >= 0.01 && limit <= MAX_BUDGET;

  const nav = (back: number | null, next: () => void, nextLabel: string, disabled = false) => (
    <div className="mt-8 flex justify-between gap-3">
      {back !== null ? (
        <button className="btn btn-ghost" onClick={() => setStep(back)}>
          ← Back
        </button>
      ) : (
        <span />
      )}
      <button className="btn btn-primary" disabled={disabled} onClick={next}>
        {nextLabel}
      </button>
    </div>
  );

  return (
    <div className="card p-5 sm:p-8">
      <ol className="flex gap-2" aria-label="Progress">
        {steps.map((st, i) => (
          <li key={st} className="flex-1">
            <div className={`h-0.5 ${i <= step ? "bg-ink" : "bg-line"}`} />
            <p className={`mt-2 truncate font-mono text-[11px] uppercase tracking-widest ${i === step ? "text-ink" : "text-muted"}`}>
              {i + 1}
              <span className={i === step ? "" : "hidden sm:inline"}>. {st}</span>
            </p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="mt-8">
          <h2 className="font-display text-2xl font-semibold">Connect your wallet</h2>
          <p className="mt-1 mb-5 text-sm text-ink-2">It owns your agent. You sign once; no gas.</p>
          <HoldfastWallet onReady={onWallet} />
          {holdfast && !existing && (
            <p className="mt-4 text-sm text-ink-2">
              {checking ? (
                "Checking…"
              ) : (
                <>
                  No agent yet for <span className="font-mono text-ink">{holdfast.address.slice(0, 6)}…{holdfast.address.slice(-4)}</span>.
                </>
              )}
            </p>
          )}
          {existing && (
            <div className="mt-5 rounded-md border border-ink p-4">
              <p className="text-sm text-ink-2">This wallet already has an agent. Opening it…</p>
              <p className="font-display mt-1 text-xl font-semibold">{existing.name}</p>
              <button className="btn btn-primary mt-3" onClick={() => router.push(`/agent/${existing.id}`)}>
                Open my agent →
              </button>
            </div>
          )}
          {nav(null, () => setStep(1), "Next →", !holdfast || checking || Boolean(existing))}
        </div>
      )}

      {step === 1 && (
        <div className="mt-8">
          <h2 className="font-display text-2xl font-semibold">What should it do?</h2>
          <p className="mt-1 text-sm text-ink-2">Pick a ready-made job, write your own, or skip and decide later. It pays for data per run, over x402.</p>
          <div className="mt-5 grid gap-3" role="radiogroup" aria-label="Strategy">
            {STRATEGIES.map((st) => {
              const on = strategy === st.id;
              return (
                <button
                  key={st.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setStrategy(st.id)}
                  className={`flex gap-4 rounded-md border p-4 text-left transition sm:p-5 ${on ? "border-ink bg-surface-2" : "border-line hover:border-ink"}`}
                >
                  <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border ${on ? "border-ink text-ink" : "border-line text-ink-2"}`}>
                    <Icon>{st.icon}</Icon>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-display text-lg font-semibold">{st.name}</span>
                      <span className="font-mono text-xs text-ink-2">${fmtUsd(st.cost)} / run</span>
                    </span>
                    <span className="block text-sm text-ink">{st.tagline}</span>
                    <span className="mt-1 block text-sm text-ink-2">{st.does}</span>
                    {on && (
                      <span className="mt-3 block rounded border-l-2 border-ink bg-bg px-3 py-2 text-sm text-ink-2">
                        <span className="block font-mono text-[10px] uppercase tracking-widest text-muted">Example brief</span>
                        {st.example}
                      </span>
                    )}
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {st.buys.map((b) => (
                        <span key={b} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                          buys: {b}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
            <div
              role="radio"
              aria-checked={strategy === "custom"}
              tabIndex={0}
              onClick={() => setStrategy("custom")}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setStrategy("custom")}
              className={`flex cursor-pointer gap-4 rounded-md border p-4 text-left transition sm:p-5 ${strategy === "custom" ? "border-ink bg-surface-2" : "border-line hover:border-ink"}`}
            >
              <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border ${strategy === "custom" ? "border-ink text-ink" : "border-line text-ink-2"}`}>
                <Icon>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </Icon>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-display text-lg font-semibold">Your own</span>
                  <span className="font-mono text-xs text-ink-2">up to ${fmtUsd(CUSTOM_COST)} / run</span>
                </span>
                <span className="block text-sm text-ink">Tell it what to do, in your words</span>
                <span className="mt-1 block text-sm text-ink-2">It picks the data it needs from every Fuci tool and answers your mission on each run.</span>
                {strategy === "custom" && (
                  <>
                    <textarea
                      aria-label="Your agent's mission"
                      value={mission}
                      maxLength={MAX_MISSION}
                      rows={3}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setMission(e.target.value)}
                      placeholder="e.g. Tell me which new Argus tokens have a real community, and warn me when a dev sells."
                      className="mt-3 block w-full field px-3 py-2 text-sm"
                    />
                    <span className="mt-1 block text-right font-mono text-[10px] text-muted">
                      {mission.length}/{MAX_MISSION}
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-ink-2">
            Not sure yet?{" "}
            <button
              className="underline underline-offset-2 hover:text-ink"
              onClick={() => {
                setStrategy("custom");
                setMission("");
                setStep(2);
              }}
            >
              Skip for now
            </button>{" "}
            and set it up on your agent&apos;s page.
          </p>
          {nav(0, () => setStep(2), "Next →")}
        </div>
      )}

      {step === 2 && (
        <div className="mt-8">
          <h2 className="font-display text-2xl font-semibold">Set a daily budget</h2>
          <p className="mt-1 text-sm text-ink-2">A hard cap: your agent refuses any payment past it. Change it any time.</p>
          <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Daily budget">
            {BUDGETS.map((b) => (
              <button key={b} role="radio" aria-checked={limit === b} onClick={() => setLimit(b)} className={`tab ${limit === b ? "tab-active" : ""}`}>
                ${b < 1 ? b.toFixed(2) : b}
              </button>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-ink-2" htmlFor="agent-limit">
            Or enter an amount
            <span className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                id="agent-limit"
                type="number"
                min={0.01}
                max={MAX_BUDGET}
                step={0.01}
                value={limit}
                onChange={(e) => setLimit(Math.round(Number(e.target.value) * 100) / 100)}
                className="w-32 field py-2 pl-7 pr-3 font-mono"
              />
            </span>
            <span>USDC / day</span>
          </label>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-line p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Covers</p>
              <p className="font-display mt-1 text-2xl font-semibold tabular-nums">{validLimit ? runsPerDay.toLocaleString() : "–"}</p>
              <p className="text-sm text-ink-2">{chosen.name} runs a day</p>
            </div>
            <div className="rounded-md border border-line p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Running every 5 min costs</p>
              <p className="font-display mt-1 text-2xl font-semibold tabular-nums">${fmtUsd(every5min)}</p>
              <p className="text-sm text-ink-2">a day, the most it can use</p>
            </div>
          </div>
          {!validLimit && <p className="mt-3 text-sm text-danger">Pick between $0.01 and ${MAX_BUDGET} a day.</p>}
          {nav(1, () => setStep(3), "Next →", !validLimit)}
        </div>
      )}

      {step === 3 && (
        <div className="mt-8">
          <h2 className="font-display text-2xl font-semibold">Name your agent</h2>
          <p className="mt-1 text-sm text-ink-2">The name is its address, so pick one you like.</p>
          <input
            id="agent-name"
            aria-label="Agent name"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 32))}
            placeholder="e.g. Bladder Wrack"
            className="mt-5 w-full field px-4 py-3 text-lg"
          />
          <p className="mt-2 font-mono text-xs text-muted">{name.trim() ? (slugOf(name, holdfast?.address) ? `fuci.family/agent/${slugOf(name, holdfast?.address)}` : "Use at least 2 letters or digits (some words are reserved).") : "\u00a0"}</p>

          <div className="mt-6 rounded-md border border-line p-4 sm:p-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Summary</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Name</dt>
                <dd className="truncate font-medium">{name.trim() || "–"}</dd>
              </div>
              <div>
                <dt className="text-muted">Strategy</dt>
                <dd className="font-medium">{chosen.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Budget</dt>
                <dd className="font-mono">${fmtUsd(limit)} / day</dd>
              </div>
              <div>
                <dt className="text-muted">Owner</dt>
                <dd className="font-mono">{holdfast ? `${holdfast.address.slice(0, 6)}…${holdfast.address.slice(-4)}` : "–"}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted">Next, on its page: fund it and switch on Automation to let it run on its own.</p>
          </div>
          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
          {nav(2, spawn, busy ? "Spawning…" : "Spawn agent", busy || !slugOf(name, holdfast?.address))}
        </div>
      )}
    </div>
  );
}
