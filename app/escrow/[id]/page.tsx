import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EscrowJobActions } from "@/components/EscrowJobActions";
import { escrowAddress, escrowJob, readNote, serverNow } from "@/lib/escrow";
import { explorerAddress } from "@/lib/config";

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
  const payout = job.amountUsdc * (1 - job.feeBps / 10_000);
  const self = job.evaluator.toLowerCase() === job.client.toLowerCase();

  const rows: [string, React.ReactNode][] = [
    ["Amount", `${job.amountUsdc.toLocaleString("en-US")} USDC (agent receives ${payout.toLocaleString("en-US", { maximumFractionDigits: 6 })} after the ${job.feeBps / 100}% fee)`],
    ["Client", <a key="c" href={explorerAddress(job.client)} target="_blank" rel="noreferrer" className="break-all font-mono underline underline-offset-2">{job.client}</a>],
    [
      "Agent (provider)",
      <span key="p">
        <a href={explorerAddress(job.provider)} target="_blank" rel="noreferrer" className="break-all font-mono underline underline-offset-2">
          {job.provider}
        </a>{" "}
        · <Link href={`/kya?agent=${job.provider}`} className="underline underline-offset-2">Know Your Agent</Link>
      </span>,
    ],
    ["Reviewer", self ? "The client" : <span key="e" className="break-all font-mono">{job.evaluator}</span>],
    ["Deliver by", when(job.deadline)],
    ...(job.status === "Submitted" ? ([["Review ends", when(job.reviewDeadline)]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="eyebrow">
          <Link href="/escrow" className="hover:text-ink">
            Escrow
          </Link>{" "}
          · Job #{job.id}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{STATUS[job.status]}</h1>

        <dl className="card mt-6 grid grid-cols-1 gap-4 p-5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-muted">{k}</dt>
              <dd className="mt-0.5 text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="card mt-4 p-5">
          <h2 className="font-display text-lg font-semibold">The job</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{terms ?? "The terms aren't stored on Fuci. Their hash is on-chain: " + job.termsHash}</p>
        </section>

        {!zero.test(job.deliverable) && (
          <section className="card mt-4 p-5">
            <h2 className="font-display text-lg font-semibold">The delivery</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-2">{work ?? "Delivered off Fuci. Hash on-chain: " + job.deliverable}</p>
          </section>
        )}

        <EscrowJobActions job={job} escrow={address} now={now} />
      </div>
    </main>
  );
}
