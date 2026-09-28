import { NextResponse } from "next/server";
import { escrowJob, readNote } from "@/lib/escrow";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** One escrow job from Arc, with its terms and deliverable texts when Fuci stores them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!/^\d{1,9}$/.test(id) || n < 1) return NextResponse.json({ error: "Bad job id" }, { status: 400 });
  try {
    const job = await escrowJob(n);
    if (!job) return NextResponse.json({ error: "No such job" }, { status: 404 });
    const zero = /^0x0+$/;
    const [terms, deliverable] = await Promise.all([
      zero.test(job.termsHash) ? null : readNote(job.termsHash),
      zero.test(job.deliverable) ? null : readNote(job.deliverable),
    ]);
    return NextResponse.json({ job, terms, deliverable }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "escrow-job");
  }
}
