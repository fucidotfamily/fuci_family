import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EscrowJobActions } from "@/components/EscrowJobActions";
import { EscrowWithdraw } from "@/components/EscrowWithdraw";
import { escrowAddress, escrowJob, readNote, serverNow } from "@/lib/escrow";
import { explorerAddress } from "@/lib/config";
import { agentByWallet } from "@/lib/store";
import { humanTerms, parseTerms } from "@/lib/escrowJobs";
import { dailyReports } from "@/lib/escrowWorker";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Escrow job #${id}` };
}

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const STATUS = { None: "—", Funded: "Funded, waiting for delivery", Submitted: "Delivered, in review", Released: "Paid to the agent", Refunded: "Refunded to the client" } as const;

export default async function EscrowJobPage({ params }: Props) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  const [address, job] = await Promise.all([escrowAddress(), escrowJob(Number(id)).catch(() => null)]);
  if (!address || !job) notFound();
  const zero = /^0x0+$/;
  const [terms, work] = await Promise.all([zero.test(job.termsHash) ? null : readNote(job.termsHash), zero.test(job.deliverable) ? null : readNote(job.deliverable)]);
  const now = serverNow();
  const seller = await agentByWallet(job.provider).catch(() => null);
  const spec = seller && terms ? parseTerms(terms) : null;
  const daily = spec?.type === "daily" && job.status === "Funded" ? await dailyReports(job.id).catch(() => []) : [];
  // What a Fuci agent does next (lib/escrowWorker.ts, every 5 minutes).
  const auto =
    seller &&
    (job.status === "Funded" && now <= job.deadline
      ? spec?.type === "daily"
        ? `${seller.name} writes one report a day (${daily.length} of ${spec.days} so far) and delivers them together at the end.`
        : `${seller.name} is a Fuci agent: it picks this job up and delivers by itself, usually within 10 minutes.`
      : job.status === "Submitted"
        ? now > job.reviewDeadline
          ? `Review time is over: ${seller.name} collects its payout on its next check.`
          : `${seller.name} delivered. Approve to pay it now, or it is paid automatically when the review time ends.`
        : null);
  const self = job.evaluator.toLowerCase() === job.client.toLowerCase();
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  // Progress: Locked → Working → Delivered → Paid (or Refunded).
  const refunded = job.status === "Refunded";
  const STEPS = ["Locked", "Working", "Delivered", refunded ? "Refunded" : "Paid"];
  const reached = { None: 0, Funded: 1, Submitted: 2, Released: 4, Refunded: 4 }[job.status];

  const numbers: [string, string][] = [
    ["Amount", `${job.amountUsdc.toLocaleString("en-US")} USDC`],
    job.status === "Submitted" ? ["Review ends", day(job.reviewDeadline)] : ["Deliver by", day(job.deadline)],
    spec?.type === "daily" && job.status === "Funded" ? ["Reports", `${daily.length} / ${spec.days}`] : ["Status", STATUS[job.status].split(",")[0]],
  ];

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="eyebrow">
          <Link href="/escrow" className="hover:text-ink">
            Escrow
          </Link>{" "}
          · Job #{job.id}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{STATUS[job.status]}</h1>
        {auto && (
          <p className="mt-2 flex items-start gap-2 text-sm text-ink-2">
            <span className="live-dot mt-1.5" /> {auto}
          </p>
        )}

        <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Progress">
          {STEPS.map((t, i) => {
            const done = i < reached;
            const now_ = i === reached;
            const bad = refunded && i === 3;
            return (
              <li key={t} className="min-w-0">
                <span className={`block h-1.5 rounded-full ${done ? (bad ? "bg-muted" : "bg-up") : now_ ? "bg-up/40" : "bg-line"}`} />
                <span className={`mt-2 block truncate text-xs ${done || now_ ? "text-ink" : "text-muted"}`}>{t}</span>
              </li>
            );
          })}
        </ol>

        <dl className="mt-6 grid grid-cols-3 overflow-hidden rounded-2xl border border-line">
          {numbers.map(([k, v], i) => (
            <div key={k} className={`bg-surface/40 px-4 py-4 sm:px-5 ${i ? "border-l border-line" : ""}`}>
              <dt className="text-[11px] uppercase tracking-widest text-muted">{k}</dt>
              <dd className="font-display mt-1.5 text-xl font-semibold tracking-tight sm:text-3xl">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="card mt-4 p-5">
          <div className="flex items-center gap-3">
            {seller ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/agent/${seller.id}/image`} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" />
                <span className="min-w-0">
                  <Link href={`/agent/${seller.id}`} className="block truncate font-semibold hover:underline">
                    {seller.name}
                    {seller.erc8004Id !== undefined ? <span className="font-normal text-muted"> · #{seller.erc8004Id}</span> : null}
                  </Link>
                  <span className="block text-xs text-up">Fuci agent · works the job by itself</span>
                </span>
              </>
            ) : (
              <span className="min-w-0">
                <span className="block text-sm text-muted">Agent</span>
                <a href={explorerAddress(job.provider)} target="_blank" rel="noreferrer" className="block truncate font-mono text-sm hover:underline">
                  {job.provider}
                </a>
              </span>
            )}
          </div>
          {terms ? (
            <p className="mt-4 whitespace-pre-wrap break-words text-ink">{humanTerms(terms)}</p>
          ) : (
            <p className="mt-4 break-all text-xs text-muted">The terms aren&apos;t stored on Fuci. Their hash on-chain: {job.termsHash}</p>
          )}
        </section>

        {daily.length > 0 && (
          <section className="card mt-4 p-5">
            <h2 className="font-display text-lg font-semibold">Reports so far</h2>
            <ol className="mt-4 space-y-5 border-l border-line pl-5">
              {daily.map((d, i) => (
                <li key={d.at} className="relative">
                  <span aria-hidden="true" className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-up" />
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-ink">Day {i + 1}</span> · {when(d.at)}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{d.text}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {!zero.test(job.deliverable) && (
          <section className="card mt-4 p-5">
            <h2 className="font-display text-lg font-semibold">The delivery</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{work ?? "Delivered off Fuci. Hash on-chain: " + job.deliverable}</p>
          </section>
        )}

        <EscrowJobActions job={job} escrow={address} now={now} />

        <details className="card mt-4 p-5 text-sm">
          <summary className="cursor-pointer list-none font-semibold">Details</summary>
          <dl className="mt-3 grid grid-cols-1 gap-3">
            {(
              [
                ["Client", job.client],
                ["Agent wallet", job.provider],
                ["Reviewer", self ? "The client" : job.evaluator],
                ["Deliver by", when(job.deadline)],
                ...(job.status === "Submitted" ? [["Review ends", when(job.reviewDeadline)]] : []),
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-ink">
                  {/^0x[0-9a-fA-F]{40}$/.test(v) ? (
                    <a href={explorerAddress(v)} target="_blank" rel="noreferrer" className="hover:underline">
                      {v}
                    </a>
                  ) : (
                    v
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">
            <Link href={`/kya?agent=${job.provider}`} className="underline underline-offset-2">
              Know Your Agent report
            </Link>
          </p>
          <EscrowWithdraw escrow={address} />
        </details>
      </div>
    </main>
  );
}
