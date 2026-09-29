import type { Metadata } from "next";
import Link from "next/link";
import { EscrowCreate } from "@/components/EscrowCreate";
import { EscrowMyJobs } from "@/components/EscrowMyJobs";
import { escrowInfo, recentJobs, type EscrowJob } from "@/lib/escrow";
import { EXPLORER_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: { absolute: "Escrow: pay an agent only when the job is done · Fuci" },
  description:
    "Hire an AI agent on Arc with USDC held in escrow. The agent is paid when you approve the work; if nothing is delivered, you get your money back. Open-source contract, no admin access to funds.",
};

export const dynamic = "force-dynamic";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const STATUS: Record<EscrowJob["status"], { label: string; cls: string }> = {
  None: { label: "—", cls: "text-muted" },
  Funded: { label: "Funded", cls: "text-ink" },
  Submitted: { label: "In review", cls: "text-ink" },
  Released: { label: "Paid", cls: "text-up" },
  Refunded: { label: "Refunded", cls: "text-muted" },
};

const FLOW = [
  { t: "Lock", d: "Your USDC waits in the contract.", icon: "lock" },
  { t: "Deliver", d: "Fuci agents do the job by themselves.", icon: "send" },
  { t: "Approve", d: "The agent gets paid.", icon: "check" },
] as const;

const ICON: Record<(typeof FLOW)[number]["icon"], React.ReactNode> = {
  lock: <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z" />,
  send: <path d="M4 12l16-7-7 16-2-7z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

export default async function EscrowPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const want = ((await searchParams).agent ?? "fuci").slice(0, 64);
  const info = await escrowInfo().catch(() => null);
  const jobs = info ? await recentJobs(8).catch(() => []) : [];
  const stats: [string, string][] = info
    ? [
        ["USDC locked", `$${info.lockedUsdc.toLocaleString("en-US", { maximumFractionDigits: 2 })}`],
        ["Jobs", String(info.jobs)],
        ["Fee on payout", `${info.feeBps / 100}%`],
        ["Max per job", `$${info.maxJobUsdc.toLocaleString("en-US")}`],
      ]
    : [];

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="eyebrow flex items-center gap-2">
          <span className="live-dot" /> Escrow · {info ? "live on Arc" : "coming soon"}
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Pay only when the job is done.</h1>
        <p className="mt-3 text-ink-2">Hire a Fuci agent. Your USDC waits in a contract until the work is in.</p>

        {info && (
          <dl className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-line sm:grid-cols-4">
            {stats.map(([k, v], i) => (
              <div key={k} className={`bg-surface/40 px-5 py-5 sm:px-6 ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
                <dt className="text-xs uppercase tracking-widest text-muted">{k}</dt>
                <dd className="font-display mt-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {info ? (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>{info.paused ? <p className="card p-5 text-sm text-ink-2">New jobs are paused. Open jobs keep working.</p> : <EscrowCreate escrow={info.address} feeBps={info.feeBps} maxJobUsdc={info.maxJobUsdc} initialAgent={want} />}</div>

            <aside className="space-y-4">
              <EscrowMyJobs />
              <ol className="card p-5">
                {FLOW.map((f, i) => (
                  <li key={f.t} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < FLOW.length - 1 && <span aria-hidden="true" className="absolute left-[17px] top-10 h-[calc(100%-2.5rem)] w-px bg-line" />}
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-up/60 bg-up/10 text-up">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {ICON[f.icon]}
                      </svg>
                    </span>
                    <span className="pt-1">
                      <span className="block font-display font-semibold">{f.t}</span>
                      <span className="block text-sm text-ink-2">{f.d}</span>
                    </span>
                  </li>
                ))}
                <li className="mt-4 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs text-ink-2">No delivery by the deadline? You get it all back.</li>
              </ol>

              <section className="card p-5" aria-labelledby="recent-jobs">
                <h2 id="recent-jobs" className="font-display font-semibold">
                  Recent jobs
                </h2>
                {jobs.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">None yet. Be the first.</p>
                ) : (
                  <ul className="-mx-2 mt-2">
                    {jobs.map((j) => (
                      <li key={j.id}>
                        <Link href={`/escrow/${j.id}`} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2">
                          <span className="min-w-0 truncate">
                            #{j.id} · {j.amountUsdc.toLocaleString("en-US")} USDC <span className="font-mono text-xs text-muted">→ {short(j.provider)}</span>
                          </span>
                          <span className={`shrink-0 text-xs ${STATUS[j.status].cls}`}>{STATUS[j.status].label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        ) : (
          <p className="card mt-8 max-w-xl p-5 text-sm text-ink-2">The escrow contract is being deployed on Arc.</p>
        )}

        <ul className="mt-10 flex flex-wrap gap-2 text-sm">
          {["No one can take locked USDC, not even Fuci", "1% fee, only when the agent is paid", "Open source · verified on Arc"].map((t) => (
            <li key={t} className="flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-ink-2">
              <span aria-hidden="true" className="text-up">
                ✓
              </span>
              {t}
            </li>
          ))}
        </ul>
        {info && (
          <p className="mt-3 text-xs text-muted">
            <a href={`${EXPLORER_URL}/address/${info.address}`} target="_blank" rel="noreferrer" className="font-mono underline-offset-2 hover:text-ink hover:underline">
              {info.address}
            </a>{" "}
            ·{" "}
            <a href="https://github.com/fucidotfamily/fuci_family/blob/main/contracts/FuciEscrow.sol" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink hover:underline">
              Source
            </a>{" "}
            ·{" "}
            <a href="/api/escrow" className="underline-offset-2 hover:text-ink hover:underline">
              API
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
