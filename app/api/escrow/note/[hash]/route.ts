import { readNote } from "@/lib/escrow";

export const dynamic = "force-dynamic";

/** A stored job text, as plain text. Its keccak256 is the hash in the URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const text = await readNote(hash);
  if (text === null) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
