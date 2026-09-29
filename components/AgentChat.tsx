"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlaygroundResult } from "./Playground";
import { Logo } from "./Logo";

type Body = { from: "me"; text: string } | { from: "agent"; node: ReactNode } | { from: "agent"; answer: PlaygroundResult };
type Msg = Body & { id: number };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * The owner's chat with their agent: questions get answers (paid by the agent over x402), commands get a
 * card to confirm, a token address gets its trade card. Payment details fold into one line per answer.
 */
export function AgentChat({
  name,
  price,
  suggestions,
  ask,
  command,
  tokenCard,
}: {
  name: string;
  price: string;
  suggestions: string[];
  ask: (prompt: string) => Promise<PlaygroundResult>;
  command: (prompt: string) => Promise<ReactNode | null>;
  tokenCard: (address: string) => ReactNode;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [msgs, busy]);

  const push = (m: Body) => setMsgs((prev) => [...prev, { ...m, id: ++seq.current }]);

  const send = async (raw = text) => {
    const t = raw.trim();
    if (!t || busy) return;
    setText("");
    push({ from: "me", text: t });
    if (ADDRESS.test(t)) {
      push({ from: "agent", node: tokenCard(t) });
      return;
    }
    setBusy(true);
    try {
      const node = await command(t);
      if (node) push({ from: "agent", node });
      else push({ from: "agent", answer: await ask(t) });
    } catch (e) {
      push({ from: "agent", node: <p className="text-danger">{(e as Error).message}</p> });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex min-h-[560px] flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6" style={{ maxHeight: "62vh" }}>
        {msgs.length === 0 && (
          <div className="py-6 text-center">
            <p className="font-display text-2xl font-semibold">What should {name} do?</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
              Ask about the market, paste a token to trade it, or give an order. Orders are free and always shown to you first; questions cost {price}, paid by your agent.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-2 transition hover:border-up hover:text-ink">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) =>
          m.from === "me" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-bg">{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2">
                <Logo className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">{"answer" in m ? <Answer r={m.answer} /> : m.node}</div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface-2">
              <Logo className="h-4 w-4" />
            </span>
            <span className="flex gap-1" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-2" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex gap-2 border-t border-line p-3 sm:p-4"
      >
        <label htmlFor="agent-chat" className="sr-only">
          Message your agent
        </label>
        <input
          id="agent-chat"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={`Message ${name}: "put 10 USDC in Earn", "DCA $FUCI 2 USDC every hour"…`}
          className="field min-w-0 flex-1 px-4 py-3 text-sm"
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn btn-cta justify-center !px-5">
          Send
        </button>
      </form>
    </div>
  );
}

/** An answer: the text, then one quiet line with what it paid, and the steps behind a toggle. */
function Answer({ r }: { r: PlaygroundResult }) {
  const paid = r.steps.filter((s) => s.kind === "settled");
  const errors = r.steps.filter((s) => s.kind === "error");
  return (
    <div>
      <p className="whitespace-pre-line rounded-2xl rounded-tl-md border border-line bg-surface-2/60 px-4 py-3 text-sm leading-relaxed text-ink">{r.brief}</p>
      <details className="mt-1.5 text-xs text-muted">
        <summary className="cursor-pointer list-none hover:text-ink">
          Paid {r.spentUsdc.toFixed(4)} USDC over x402 · {paid.length} {paid.length === 1 ? "payment" : "payments"}
          {errors.length ? ` · ${errors.length} failed` : ""} · details ▾
        </summary>
        <ol className="mt-2 space-y-1 rounded-lg border border-line p-3 font-mono">
          {r.steps
            .filter((s) => s.kind === "settled" || s.kind === "data" || s.kind === "error")
            .map((s, i) => (
              <li key={i} className={`flex gap-2 ${s.kind === "error" ? "text-danger" : s.kind === "settled" ? "text-up" : ""}`}>
                <span className="shrink-0">{s.kind === "settled" ? "✓" : s.kind === "error" ? "✕" : "·"}</span>
                <span className="min-w-0">
                  {s.label}
                  {s.href && (
                    <a href={s.href} target="_blank" rel="noreferrer" className="ml-1 underline">
                      tx
                    </a>
                  )}
                </span>
              </li>
            ))}
        </ol>
      </details>
    </div>
  );
}
