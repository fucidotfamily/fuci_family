import { NextResponse, type NextRequest } from "next/server";
import { jobsOf, readNote } from "@/lib/escrow";
import { humanTerms } from "@/lib/escrowJobs";
import { allow } from "@/lib/store";

export const dynamic = "force-dynamic";

/** A wallet's escrow jobs (as client, agent or reviewer), with a one-line summary of each job. Public chain data. */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await allow(`escrow-mine:${ip}`, 60, 600))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return NextResponse.json({ error: "wallet must be an address" }, { status: 400 });
  const jobs = await jobsOf(wallet);
  const withTitles = await Promise.all(
    jobs.map(async (j) => {
      const terms = /^0x0+$/.test(j.termsHash) ? null : await readNote(j.termsHash).catch(() => null);
      return { id: j.id, role: j.role, status: j.status, amountUsdc: j.amountUsdc, deadline: j.deadline, reviewDeadline: j.reviewDeadline, title: terms ? humanTerms(terms).split("\n")[0].slice(0, 120) : null };
    }),
  );
  return NextResponse.json({ jobs: withTitles }, { headers: { "Cache-Control": "no-store" } });
}
