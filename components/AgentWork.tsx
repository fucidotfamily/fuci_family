"use client";

import Link from "next/link";
import { Playground, type PlaygroundResult } from "./Playground";
import { TokenCard } from "./TokenCard";
import { Autopilot } from "./TradingPanel";
import { ScheduledReports } from "./AutomationPanel";
import { post, signed, useIsOwner, type Owner } from "./OwnerTools";
import { toolById } from "@/lib/tools";
import { useTrading } from "./useTrading";

const ASK_PRICE = toolById("fuci_agent")!.price;
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
export function AgentWork({ agent, name, defaultStrategy }: { agent: Owner; name: string; defaultStrategy: string }) {
  const mine = useIsOwner(agent.owner);
  const ops = useTrading(agent, mine);

  // Asking, trading and the autopilot belong to the owner; visitors get an invitation instead.
  if (!mine) {
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
    <section className="mt-10" aria-labelledby="work-title">
      <h2 id="work-title" className="font-display text-3xl font-semibold">
        Put {name} to work
      </h2>
      <ul className="mt-3 space-y-1 text-sm text-ink-2">
        <li>
          <b className="text-ink">Ask</b> a question about Argus launches on Arc.{" "}
          {mine ? `Your agent pays ${ASK_PRICE} per answer from its wallet, over x402 (you sign once a day).` : "Free to try: Fuci sponsors a few questions a day."}
        </li>
        <li>
          <b className="text-ink">Paste a token address</b> (0x…) to see its price and {mine ? "buy it, or set a limit buy or limit sell." : "progress to bonding."}
        </li>
        {mine && (
          <li>
            <b className="text-ink">Autopilot</b> trades on its own from the agent wallet, every 5 minutes.
          </li>
        )}
      </ul>

      <div className="mt-5">
        <Playground
          agentId={agent.id}
          defaultStrategy={defaultStrategy === "custom" ? "" : defaultStrategy}
          placeholder="Ask about Argus, or paste a token address (0x…)"
          tokenSlot={(address) => <TokenCard address={address} ops={mine ? ops : null} />}
          priceLabel={mine ? ASK_PRICE : "free"}
          ask={
            mine
              ? async (prompt, strategy) => {
                  const r = (await post(`/api/agent/${agent.id}/ask`, { prompt, strategy: strategy || undefined, ...(await askSession(agent)) })) as PlaygroundResult;
                  void ops.load();
                  return r;
                }
              : undefined
          }
        />
      </div>

      {mine && (
        <div className="card mt-6 space-y-5 p-6 sm:p-8">
          <p className="eyebrow">Autopilot</p>
          <Autopilot ops={ops} />
          <ScheduledReports agent={agent} defaultStrategy={defaultStrategy === "custom" ? "scout" : defaultStrategy} />
        </div>
      )}
    </section>
  );
}
