import { NextResponse, type NextRequest } from "next/server";
import { allow } from "@/lib/store";
import { MAX_NOTE, saveNote } from "@/lib/escrow";

export const dynamic = "force-dynamic";

/**
 * Store a job's terms or deliverable text. Returns its keccak256 (what goes on-chain) and a public URL.
 * Plain text only; the hash is computed here from the exact text, so a stored note always matches its hash.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`escrow-note:${ip}`, 20, 600))) return NextResponse.json({ error: "Too many notes. Try again in a few minutes." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Write something" }, { status: 400 });
  if (text.length > MAX_NOTE) return NextResponse.json({ error: `At most ${MAX_NOTE} characters` }, { status: 400 });
  const hash = await saveNote(text);
  return NextResponse.json({ hash, uri: `${req.nextUrl.origin}/api/escrow/note/${hash}` });
}
