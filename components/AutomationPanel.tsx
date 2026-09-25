"use client";

import { useCallback, useEffect, useState } from "react";
import { post, signed, type Owner } from "./OwnerTools";
import { automationDetail, type AutomationSettings } from "@/lib/ownerMessage";
import { errText } from "@/lib/browserWallet";

type State = {
  automation: { enabled: boolean; everyMinutes: number; strategy: string; prompt: string; nextRunAt: number; pausedReason?: string } | null;
  dailyLimitUsdc: number;
  spentToday: number;
};

const EVERY = [
  [5, "5 min"],
  [15, "15 min"],
  [30, "30 min"],
  [60, "1 hour"],
  [180, "3 hours"],
  [360, "6 hours"],
  [720, "12 hours"],
  [1440, "1 day"],
] as const;
const STRATEGIES = [
  ["scout", "Launch Scout"],
  ["watcher", "Bonding Watcher"],
  ["oracle", "Tide Oracle"],
] as const;

function inMinutes(at: number) {
  const m = Math.round((at - Date.now()) / 60_000);
  return m <= 0 ? "any moment" : m < 60 ? `in ${m} min` : `in ${Math.round(m / 60)} h`;
}

/** Owner-only, folded away: paid x402 market reports on a schedule, saved to History. */
export function ScheduledReports({ agent, defaultStrategy }: { agent: Owner; defaultStrategy: string }) {
  const [state, setState] = useState<State | null>(null);
  const [form, setForm] = useState<AutomationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(
    () =>
      fetch(`/api/agent/${agent.id}/automation`, { cache: "no-store" })
        .then((r) => r.json())
        .then((s: State) => {
          setState(s);
          setForm(
            (f) =>
              f ?? {
                enabled: s.automation?.enabled ?? false,
                everyMinutes: s.automation?.everyMinutes ?? 60,
                strategy: s.automation?.strategy ?? defaultStrategy,
                prompt: s.automation?.prompt ?? "",
                dailyLimitUsdc: s.dailyLimitUsdc,
              },
          );
        })
        .catch(() => undefined),
    [agent.id, defaultStrategy],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!state || !form) return null;
  const a = state.automation;

  const save = async (enabled = form.enabled) => {
    setBusy(true);
    setMsg(null);
    try {
      const settings = { ...form, enabled };
      await post(`/api/agent/${agent.id}/automation`, { action: "save", settings, ...(await signed(agent, "set-automation", automationDetail(settings))) });
      setForm(settings);
      setMsg({ ok: true, text: enabled ? "Saved. Reports are on." : "Saved. Reports are off." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="border-t border-line pt-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Scheduled reports <span className="font-normal text-muted">· {a?.enabled ? "on" : "off"}</span>
      </summary>
      <p className="mt-2 text-sm text-ink-2">Buys a paid x402 market report on a schedule and saves it to History. Costs fractions of a cent.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
        <label className="text-sm text-ink-2">
          Every
          <select className="mt-1 block w-full field px-3 py-2" value={form.everyMinutes} onChange={(e) => setForm({ ...form, everyMinutes: Number(e.target.value) })}>
            {EVERY.map(([m, l]) => (
              <option key={m} value={m}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-2">
          Report
          <select className="mt-1 block w-full field px-3 py-2" value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
            {STRATEGIES.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-2">
          Focus (optional)
          <input className="mt-1 block w-full field px-3 py-2" value={form.prompt} maxLength={200} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="e.g. tokens near bonding" />
        </label>
        <label className="text-sm text-ink-2">
          Max / day
          <input type="number" min={0.01} max={100} step={0.01} className="mt-1 block w-24 field px-3 py-2 font-mono" value={form.dailyLimitUsdc} onChange={(e) => setForm({ ...form, dailyLimitUsdc: Number(e.target.value) })} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={`tab ${form.enabled ? "tab-active" : ""}`} aria-pressed={form.enabled} disabled={busy} onClick={() => save(!form.enabled)}>
          {form.enabled ? "On" : "Off"}
        </button>
        <button className="btn btn-ghost !py-2" disabled={busy} onClick={() => save()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-muted">
          {a?.pausedReason ? `Paused: ${a.pausedReason}` : a?.enabled ? `Next report ${inMinutes(a.nextRunAt)} · today ${state.spentToday.toFixed(3)}/${state.dailyLimitUsdc.toFixed(2)} USDC` : ""}
        </span>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-up" : "text-danger"}`}>{msg.text}</p>}
    </details>
  );
}
