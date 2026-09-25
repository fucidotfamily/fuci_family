import { NextResponse, type NextRequest } from "next/server";
import { avatarSvg } from "@/lib/avatar";
import { OwnerError, verifyOwner } from "@/lib/ownerAuth";
import { allow, kvGet, kvSet, pushHistory, resolveAgent, saveAgent } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_BYTES = 200_000;
const imageKey = (id: string) => `agent-image:${id}`;

/** The agent's profile image: the owner's upload, else its X avatar, else a generated kelp avatar. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { agent } = await resolveAgent(id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const cache = { "Cache-Control": "public, max-age=300, s-maxage=300", "Access-Control-Allow-Origin": "*" };
  if (agent.image) {
    const data = await kvGet<string>(imageKey(agent.id));
    if (data) return new Response(new Uint8Array(Buffer.from(data, "base64")), { headers: { ...cache, "content-type": "image/jpeg" } });
  }
  if (agent.x?.avatar) return NextResponse.redirect(agent.x.avatar, { status: 302, headers: cache });
  return new Response(avatarSvg(agent.id), { headers: { ...cache, "content-type": "image/svg+xml" } });
}

/** Owner-only: upload (JPEG data URL, square, max 200 KB) or remove the profile image. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`agent-image:${ip}`, 10, 600))) return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { remove?: boolean; dataUrl?: string; address?: string; issuedAt?: number; signature?: string };
  try {
    if (b.remove) {
      const agent = await verifyOwner(id, "remove-image", b);
      delete agent.image;
      await saveAgent(agent);
      await pushHistory(agent.id, { kind: "profile", label: "Profile image removed" });
      return NextResponse.json({ ok: true });
    }
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(b.dataUrl ?? "");
    if (!m) return NextResponse.json({ error: "Send a JPEG image" }, { status: 400 });
    const bytes = Buffer.from(m[1], "base64");
    if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "Image is too large (max 200 KB after resizing)" }, { status: 413 });
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return NextResponse.json({ error: "Not a JPEG file" }, { status: 400 });
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const agent = await verifyOwner(id, "set-image", b, digest);
    await kvSet(imageKey(agent.id), m[1]);
    agent.image = Date.now();
    await saveAgent(agent);
    await pushHistory(agent.id, { kind: "profile", label: "Profile image updated" });
    return NextResponse.json({ ok: true, image: agent.image });
  } catch (e) {
    if (e instanceof OwnerError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
