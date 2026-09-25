import type { HistoryEvent } from "@/lib/store";

const ICON: Record<HistoryEvent["kind"], string> = { spawn: "✦", run: "◎", payment: "$", identity: "#", validation: "✓", profile: "○", trade: "⇄" };

const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** The agent's history, with explorer links for on-chain transactions. */
export function AgentHistory({ events }: { events: HistoryEvent[] }) {
  return (
    <section className="card mt-6 p-6 sm:p-8">
      <p className="eyebrow">History</p>
      <ol className="mt-4 space-y-3">
        {events.map((e, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="mt-0.5 w-5 shrink-0 text-center font-mono text-muted">{ICON[e.kind]}</span>
            <span className="min-w-0 flex-1">
              <span className="text-ink">{e.label}</span>
              {e.usdc ? <span className="ml-2 font-mono text-xs text-ink-2">{e.usdc} USDC</span> : null}
              <span className="block font-mono text-[11px] text-muted">
                {when(e.at)}
                {e.href ? (
                  <>
                    {" · "}
                    <a className="underline hover:text-ink" href={e.href} target="_blank" rel="noreferrer">
                      tx
                    </a>
                  </>
                ) : e.kind === "payment" ? (
                  " · settles in Circle Gateway's next batch"
                ) : null}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
