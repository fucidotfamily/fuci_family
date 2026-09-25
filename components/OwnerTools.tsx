"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { knownOwner } from "@/lib/myAgent";
import { ownerMessage } from "@/lib/ownerMessage";
import { errText, signAsOwner } from "@/lib/browserWallet";

export type Owner = { id: string; owner: string; ownerKind: "browser" | "passkey" };
type Action = Parameters<typeof ownerMessage>[0]["action"];

export function useIsOwner(owner: string) {
  const [mine, setMine] = useState(false);
  useEffect(() => {
    knownOwner()
      .then((a) => setMine(Boolean(a && a.toLowerCase() === owner.toLowerCase())))
      .catch(() => setMine(false));
  }, [owner]);
  return mine;
}

export async function signed({ id, owner, ownerKind }: Owner, action: Action, detail?: string) {
  const issuedAt = Date.now();
  const { address, signature } = await signAsOwner(ownerKind, owner, ownerMessage({ action, agent: id, detail, issuedAt }));
  return { address, issuedAt, signature };
}

export async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Crop to a centered square, resize to 400px and encode as JPEG (under 200 KB). */
async function toJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 400;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 400, 400);
  for (const q of [0.88, 0.75, 0.6]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length * 0.75 < 190_000) return url;
  }
  throw new Error("Image too large");
}

async function sha256Hex(dataUrl: string) {
  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The agent's avatar. Its owner can click it to change or remove the image. */
export function EditableAvatar({ agent, src, alt, hasImage }: { agent: Owner; src: string; alt: string; hasImage: boolean }) {
  const router = useRouter();
  const mine = useIsOwner(agent.owner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- served by our own route, may redirect to X's CDN
    <img src={src} alt={alt} width={112} height={112} className="h-20 w-20 rounded-full border border-line object-cover sm:h-28 sm:w-28" />
  );
  if (!mine) return <div className="shrink-0">{img}</div>;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="group relative block rounded-full"
        disabled={busy}
        onClick={() => file.current?.click()}
        aria-label="Change profile image"
        title="Change image"
      >
        {img}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 font-mono text-[10px] uppercase tracking-widest text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? "…" : "Edit"}
        </span>
      </button>
      {hasImage && !busy && (
        <button
          type="button"
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-bg text-xs text-ink-2 hover:text-ink"
          onClick={() => run(async () => void (await post(`/api/agent/${agent.id}/image`, { remove: true, ...(await signed(agent, "remove-image")) })))}
          aria-label="Remove profile image"
          title="Remove image"
        >
          ×
        </button>
      )}
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          run(async () => {
            const dataUrl = await toJpeg(f);
            await post(`/api/agent/${agent.id}/image`, { dataUrl, ...(await signed(agent, "set-image", await sha256Hex(dataUrl))) });
          });
        }}
      />
      {error && <p className="absolute left-0 top-full mt-1 w-56 text-xs text-danger">{error}</p>}
    </div>
  );
}

const X_NOTE: Record<string, string> = { cancelled: "X login cancelled", expired: "X login timed out", failed: "X login failed" };

/** Owner-only "Connect X" / "Disconnect X", next to the share buttons. Hidden when X login is off. */
export function XConnect({ agent, connected, enabled }: { agent: Owner; connected: boolean; enabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const mine = useIsOwner(agent.owner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!mine || (!enabled && !connected)) return null;

  const click = async () => {
    setBusy(true);
    setError(null);
    try {
      if (connected) {
        await post("/api/x/disconnect", { agent: agent.id, ...(await signed(agent, "disconnect-x")) });
        router.refresh();
      } else {
        const { url } = await post("/api/x/start", { agent: agent.id, ...(await signed(agent, "connect-x")) });
        window.location.href = url;
        return;
      }
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  };

  const note = error ?? X_NOTE[params.get("x") ?? ""];
  return (
    <>
      <button className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-2 hover:border-ink hover:text-ink" disabled={busy} onClick={click}>
        {busy ? "…" : connected ? "Disconnect X" : "Connect X"}
      </button>
      {note && <span className="text-xs text-danger">{note}</span>}
    </>
  );
}
