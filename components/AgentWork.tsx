"use client";

import Link from "next/link";
import type { PlaygroundResult } from "./Playground";
import { AgentChat } from "./AgentChat";
import { TokenCard } from "./TokenCard";
import { Autopilot } from "./TradingPanel";
import { ScheduledReports } from "./AutomationPanel";
import { EarnPanel } from "./EarnPanel";
import { CommandCard, type Proposal } from "./CommandCard";
import { post, signed, useIsOwner, type Owner } from "./OwnerTools";
import { toolById } from "@/lib/tools";
import { useTrading } from "./useTrading";

const ASK_PRICE = toolById("fuci_agent")!.price;
const COMMAND_SUGGESTIONS = ["Put all my idle USDC in Earn", "DCA $FUCI 2 USDC every hour", "Which token is closest to bonding?", "Stop the autopilot"];
const SESSION_MS = 23 * 60 * 60_000; // the server accepts 24 h; renew a little early

type Session = { address: string; issuedAt: number; signature: string };

/** One owner signature per day covers every question (stored only in this browser). */
async function askSession(agent: Owner): Promise<Session> {
  const key = `fuci-ask:${agent.id}`;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Session | null;
    if (saved && Date.now() - saved.issuedAt < SESSION_MS && saved.address.toLowerCase() === agent.owner.toLowerCase()) return saved;
  } catch {
    // no storage: sign each time
  }
  const s = (await signed(agent, "ask", "session")) as Session;
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    // ignore
  }
  return s;
}

/** "Put <agent> to work": ask it, trade one token, or let the autopilot trade on its own. */
export function AgentWork({ agent, name, defaultStrategy, part = "all" }: { agent: Owner; name: string; defaultStrategy: string; part?: "all" | "ask" | "autopilot" | "invite" }) {
  const mine = useIsOwner(agent.owner);
  const ops = useTrading(agent, mine);

  // Asking, trading and the autopilot belong to the owner; visitors get an invitation instead.
  // "invite" is the visitors' call to spawn their own; the owner already has the tabs.
  if (part === "invite" && mine) return null;
  if (!mine) {
    if (part === "autopilot") return null;
    return (
      <section className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8">
        <div>
          <p className="font-display text-xl font-semibold">Want an agent like {name}?</p>
          <p className="mt-1 text-sm text-ink-2">Spawn your own on Arc: it asks, trades and pays its own way in USDC.</p>
        </div>
        <Link href="/spawn" className="btn btn-primary">
          Spawn your agent
        </Link>
      </section>
    );
  }

  return (
    <section className={part === "all" ? "mt-10" : ""} aria-labelledby="work-title">
      {part !== "autopilot" && (
        <>
      <AgentChat
        name={name}
        price={ASK_PRICE}
        suggestions={COMMAND_SUGGESTIONS}
        tokenCard={(address) => <TokenCard address={address} ops={ops} />}
        command={async (prompt) => {
          const r = (await post(`/api/agent/${agent.id}/intent`, { prompt, ...(await askSession(agent)) }).catch(() => ({ kind: "question" }))) as
            | Proposal
            | { kind: "question" }
            | { kind: "unclear"; message: string };
          if (r.kind === "action") return <CommandCard agent={agent} ops={ops} proposal={r} />;
          if (r.kind === "unclear") return <p className="rounded-2xl rounded-tl-md border border-line bg-surface-2/60 px-4 py-3 text-sm text-ink">{r.message}</p>;
          return null;
        }}
        ask={async (prompt) => {
          const r = (await post(`/api/agent/${agent.id}/ask`, { prompt, ...(await askSession(agent)) })) as PlaygroundResult;
          void ops.load();
          return r;
        }}
      />
        </>
      )}

      {mine && part !== "ask" && (
        <div className={`card space-y-5 p-6 sm:p-8 ${part === "all" ? "mt-6" : ""}`}>
          <p className="eyebrow">Autopilot</p>
          <Autopilot ops={ops} />
          <ScheduledReports agent={agent} defaultStrategy={defaultStrategy === "custom" ? "scout" : defaultStrategy} />
        </div>
      )}
      {mine && part === "all" && <EarnPanel agent={agent} />}
    </section>
  );
}
