"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOnrampKit, parseOnrampSession, type OnrampSession, type OnrampWidget } from "@circle-fin/onramp-kit";

/** Is "Buy USDC with card" set up on this deployment? Asked once per page. */
let enabledOnce: Promise<boolean> | null = null;
const onrampEnabled = () =>
  (enabledOnce ??= fetch("/api/onramp/config")
    .then((r) => r.json())
    .then((b: { enabled?: boolean }) => Boolean(b.enabled))
    .catch(() => false));

type Target = { agentId: string; address?: never } | { address: string; agentId?: never };

async function newSession(target: Target): Promise<OnrampSession> {
  const r = await fetch("/api/onramp/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(target) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? "Could not start the purchase");
  return parseOnrampSession(body);
}

const NOT_COMPLETED: Record<string, string> = {
  CANCELED_BY_CUSTOMER: "Purchase canceled.",
  SESSION_TIMEOUT: "The purchase window timed out. Tap again to start over.",
};

/**
 * "Buy USDC with card": Circle's hosted onramp (debit card, Apple Pay, Google Pay, identity check
 * included) sends USDC on Arc straight to `agentId`'s wallet or to `address`. Opens as a popup (a
 * session is prepared ahead so the click can open it at once), or inline where popups can't open.
 */
export function BuyUsdc({ target, label = "Buy USDC with card", onSettled, className = "btn btn-ghost !py-1.5" }: { target: Target; label?: string; onSettled?: () => void; className?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [session, setSession] = useState<OnrampSession | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inline, setInline] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<OnrampWidget | null>(null);
  const key = target.agentId ?? target.address;

  const prepare = useCallback(() => {
    newSession(target)
      .then(setSession)
      .catch((e: Error) => setMsg({ ok: false, text: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the target
  }, [key]);

  useEffect(() => {
    let live = true;
    onrampEnabled().then((on) => {
      if (!live || !on) return;
      setEnabled(true);
      prepare();
    });
    return () => {
      live = false;
      widget.current?.close();
    };
  }, [prepare]);

  if (!enabled) return null;

  const callbacks = {
    onDepositSubmitted: () => setMsg({ ok: true, text: "Payment submitted. USDC is on its way…" }),
    onDepositSettled: ({ payload }: { payload: { amount?: number; tokenSymbol?: string } }) => {
      setMsg({ ok: true, text: `✓ ${payload.amount ?? ""} ${payload.tokenSymbol ?? "USDC"} arrived on Arc.`.replace("  ", " ") });
      setInline(false);
      onSettled?.();
      prepare(); // sessions are single-use
    },
    onDepositNotCompleted: ({ code, payload }: { code: string; payload: { errorMessage?: string } }) => {
      setMsg({ ok: false, text: NOT_COMPLETED[code] ?? payload.errorMessage ?? "The purchase didn't complete." });
      setInline(false);
      prepare();
    },
    onInitializationError: ({ payload }: { payload?: { errorMessage?: string } }) => setMsg({ ok: false, text: payload?.errorMessage ?? "The purchase window couldn't load. Try again." }),
    onSessionExpired: () => prepare(),
  };

  // Must stay synchronous: browsers only allow popups opened directly from the click.
  const open = () => {
    if (!session) return;
    setMsg(null);
    const onramp = createOnrampKit();
    const result = onramp.openWindow({ session, ...callbacks });
    if (result.status === "opened") {
      widget.current = result.widget;
      setMsg({ ok: true, text: "Finish the purchase in the Circle window." });
      setSession(null);
      return;
    }
    if (result.reason === "popup_blocked") {
      setMsg({ ok: false, text: "Your browser blocked the window. Allow popups for fuci.family and tap again." });
      return;
    }
    // In-app browsers and installed apps can't open popups: show the widget right here.
    setInline(true);
    setSession(null);
    requestAnimationFrame(() => {
      if (box.current) widget.current = onramp.mountIframe({ session, container: box.current, ...callbacks });
    });
  };

  return (
    <>
      <button type="button" className={className} disabled={!session} onClick={open} title="Debit card, Apple Pay or Google Pay, via Circle">
        {session ? label : "Preparing…"}
      </button>
      {msg && <span className={`basis-full text-xs ${msg.ok ? "text-up" : "text-danger"}`}>{msg.text}</span>}
      {inline && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-label="Buy USDC">
          <div className="relative h-[80vh] w-full max-w-md overflow-hidden rounded-lg border border-line bg-bg">
            <button
              type="button"
              className="absolute top-2 right-2 z-10 rounded bg-bg/80 px-2 py-1 text-sm"
              onClick={() => {
                widget.current?.close();
                setInline(false);
                prepare();
              }}
            >
              Close
            </button>
            <div ref={box} className="h-full w-full" />
          </div>
        </div>
      )}
    </>
  );
}
