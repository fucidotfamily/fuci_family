"use client";

import { useState } from "react";
import { post, signed, useIsOwner, type Owner } from "./OwnerTools";
import { errText } from "@/lib/browserWallet";
import { PROFILE_LIMITS, normalizeProfile, profileDetail, type AgentProfile } from "@/lib/agentProfile";

/**
 * Owner-only: what the agent's ERC-8004 registration file says (the on-chain record points to it).
 * Set it before creating the agent on-chain; edits later update the same record, no new mint.
 */
export function ProfileForm({ agent, initial, defaultDescription, registered }: { agent: Owner; initial: AgentProfile; defaultDescription: string; registered: boolean }) {
  const mine = useIsOwner(agent.owner);
  const [open, setOpen] = useState(!registered);
  const [form, setForm] = useState({
    description: initial.description ?? "",
    website: initial.website ?? "",
    mcp: initial.mcp ?? "",
    a2a: initial.a2a ?? "",
    skills: (initial.skills ?? []).join(", "),
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!mine) return null;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const profile = normalizeProfile({ ...form, skills: form.skills.split(",") });
      await post(`/api/agent/${agent.id}/profile`, { profile, ...(await signed(agent, "set-profile", profileDetail(profile))) });
      setMsg({ ok: true, text: registered ? "Saved. The on-chain record now shows these details." : "Saved. Now create it on-chain below." });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const field = "mt-1 block w-full field px-3 py-2 text-sm";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="mb-6 rounded-md border border-line p-4 sm:p-5">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <span className="block font-semibold">{registered ? "Edit the on-chain profile" : "Step 1 · What the world sees"}</span>
          <span className="block text-xs text-muted">Name, image, description, links and skills in the agent&apos;s ERC-8004 record. Editable anytime.</span>
        </span>
        <span className="font-mono text-ink transition" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3 text-sm text-ink-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- the agent's own image route */}
            <img src={`/api/agent/${agent.id}/image`} alt="" width={40} height={40} className="h-10 w-10 rounded-full border border-line object-cover" />
            <span>Image: the agent&apos;s picture. Change it by clicking the picture on the card above.</span>
          </div>

          <label className="block text-sm text-ink-2">
            Description
            <textarea rows={3} maxLength={PROFILE_LIMITS.description} value={form.description} onChange={set("description")} placeholder={defaultDescription} className={field} />
            <span className="mt-1 block text-right font-mono text-[10px] text-muted">
              {form.description.length}/{PROFILE_LIMITS.description} · empty uses the text above
            </span>
          </label>

          <label className="block text-sm text-ink-2">
            Skills <span className="text-muted">(comma separated, up to {PROFILE_LIMITS.skills})</span>
            <input value={form.skills} onChange={set("skills")} placeholder="e.g. Argus launch alerts, dev-sell watch, market mood" className={field} />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm text-ink-2">
              Website <span className="text-muted">(optional)</span>
              <input value={form.website} onChange={set("website")} placeholder="https://…" className={field} />
            </label>
            <label className="block text-sm text-ink-2">
              MCP endpoint <span className="text-muted">(optional)</span>
              <input value={form.mcp} onChange={set("mcp")} placeholder="https://…/mcp" className={field} />
            </label>
            <label className="block text-sm text-ink-2">
              A2A endpoint <span className="text-muted">(built in; override)</span>
              <input value={form.a2a} onChange={set("a2a")} placeholder={`Built in: /api/agent/${agent.id}/a2a`} className={field} />
            </label>
          </div>

          <p className="text-xs text-muted">
            Always included: x402 payments ✓, A2A ✓, the agent&apos;s Fuci page, its X account if connected, Fuci&apos;s paid tools as skills, and trust via reputation and
            validation.{" "}
            <a className="underline" href={`/api/agent/${agent.id}/card`} target="_blank" rel="noreferrer">
              Preview the file
            </a>
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary !py-2" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save profile"}
            </button>
            {msg && <span className={`text-sm ${msg.ok ? "text-up" : "text-danger"}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
