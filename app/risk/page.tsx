import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RiskSearch } from "@/components/RiskSearch";
import { GRADE_COLOR, RiskReportView } from "@/components/RiskReportView";
import { arcProtocols, cachedRisk, categoryHelp, getRisk, RiskInputError, warmRisk } from "@/lib/risk";
import { FUCI_TOKEN } from "@/lib/config";

export const metadata: Metadata = {
  title: { absolute: "Fuci Risk: know the risk before you ape" },
  description:
    "Free A–F risk ratings for tokens on Arc and DeFi protocols: contract control, liquidity, holder concentration, audits, hack history, TVL and yield sustainability. Every number sourced.",
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { searchParams: Promise<{ [k: string]: string | string[] | undefined }> };

const tvl = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`);

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

async function Report({ target }: { target: string }) {
  const result = await getRisk(target).then(
    (r) => ({ r, error: null }),
    (e: unknown) => ({ r: null, error: e instanceof RiskInputError ? e.message : "We couldn't finish this check right now (a data source didn't answer). Try again in a minute." }),
  );
  if (result.r) return <RiskReportView r={result.r} />;
  return (
    <div className="card mt-8 p-5 text-sm text-ink-2" role="alert">
      <b className="text-ink">No report.</b> {result.error}
    </div>
  );
}

function Loading() {
  return (
    <div className="card mt-8 p-6" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <span className="live-dot" /> Reading the chain, pools and records… a busy new token can take up to 30 seconds.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

const METHOD: { t: string; d: string }[] = [
  { t: "Contract control", d: "Who can change the token: an owner, an upgradeable proxy, mint, pause or blacklist functions. Read straight from the contract on Arc." },
  { t: "Launch terms", d: "For Argus launches: the buy and sell tax fixed by the launch hook, and whether the token has bonded." },
  { t: "Liquidity", d: "How much sits in trading pools (DexScreener), and how that compares to the token's valuation. Thin pools make selling hard." },
  { t: "Holder concentration", d: "Replayed from every transfer on Arc (tokens up to 14 days old). Pools, locks and burns are left out; any other large holder counts." },
  { t: "Age & activity", d: "How long it has existed and how actively it trades. Most rug pulls happen in the first days." },
  { t: "Audits & security history", d: "For protocols: audits listed on DefiLlama and every hack in DefiLlama's database, weighted by how recent." },
  { t: "TVL, governance & yield", d: "Value locked and its stability, public governance, and how much of the yield is real fees versus emitted reward tokens." },
];

export default async function RiskPage({ searchParams }: Props) {
  const sp = await searchParams;
  const target = one(sp.token) || one(sp.protocol);
  const picks = await arcProtocols(8).catch(() => []);
  // Grades on the cards come from cached reports only (instant); missing ones are computed after the response.
  const graded = target ? [] : await Promise.all(picks.map(async (p) => ({ ...p, report: await cachedRisk(p.slug) })));
  if (!target) warmRisk(graded.filter((p) => !p.report).map((p) => p.slug));

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="eyebrow flex items-center gap-2">
          <span className="live-dot" /> Fuci Risk
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Know the risk before you put money in.</h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          A free A–F rating for any token on Arc or DeFi protocol. Every score is built from real on-chain and public data, explained in plain words, with a link to the source. When
          data is missing we say &quot;Unknown&quot; instead of guessing.
        </p>

        <div className="mt-8 max-w-3xl">
          <RiskSearch initial={target} />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Try:</span>
            <Link href={`/risk?token=${FUCI_TOKEN}`} className="rounded-full border border-line px-3 py-1 text-ink-2 hover:border-ink hover:text-ink">
              $FUCI
            </Link>
            {picks.slice(0, 5).map((p) => (
              <Link key={p.slug} href={`/risk?protocol=${p.slug}`} className="rounded-full border border-line px-3 py-1 text-ink-2 hover:border-ink hover:text-ink">
                {p.name}
              </Link>
            ))}
          </div>
        </div>

        {target ? (
          <Suspense key={target} fallback={<Loading />}>
            <Report target={target} />
          </Suspense>
        ) : (
          picks.length > 0 && (
            <section className="mt-12" aria-labelledby="arc-protocols">
              <h2 id="arc-protocols" className="font-display text-2xl font-semibold tracking-tight">
                DeFi on Arc
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-ink-2">The largest DeFi protocols on Arc by value locked, with their current grade. Tap one for the full report.</p>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {graded.map((p) => {
                  const g = p.report?.grade ?? null;
                  const help = categoryHelp(p.category);
                  return (
                    <li key={p.slug}>
                      <Link href={`/risk?protocol=${p.slug}`} className="card flex h-full flex-col p-4 hover:border-ink">
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{p.name}</span>
                            <span className="mt-0.5 block font-mono text-xs text-muted">
                              {p.category ?? "DeFi"} · {tvl(p.tvl)} TVL
                            </span>
                          </span>
                          <span
                            className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md border-2 leading-none"
                            style={{ borderColor: g ? GRADE_COLOR[g] : "var(--line)", color: g ? GRADE_COLOR[g] : "var(--muted)" }}
                            aria-label={g ? `Grade ${g}` : "Grade being calculated"}
                            title={g ? `${p.report!.label} · ${p.report!.score}/100` : "Being calculated, refresh in a moment"}
                          >
                            <span className="font-display text-xl font-bold">{g ?? "…"}</span>
                            {p.report?.score != null && <span className="font-mono text-[9px]">{p.report.score}</span>}
                          </span>
                        </span>
                        {help && <span className="mt-3 text-xs leading-relaxed text-ink-2">{help}</span>}
                        {p.report?.redFlags.length ? (
                          <span className="mt-2 text-xs" style={{ color: GRADE_COLOR.F }}>
                            ▲ {p.report.redFlags[0]}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {graded.some((p) => !p.report) && <p className="mt-2 text-xs text-muted">Grades marked … are being calculated; refresh in a few seconds.</p>}
            </section>
          )
        )}

        <section className="mt-16" aria-labelledby="method">
          <h2 id="method" className="font-display text-2xl font-semibold tracking-tight">
            How the grade works
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Grade scale">
            {(["A", "B", "C", "D", "F"] as const).map((g, i) => (
              <li key={g} className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm">
                <b className="font-display" style={{ color: GRADE_COLOR[g] }}>
                  {g}
                </b>
                <span className="text-ink-2">{["80+ lower", "65+ moderate", "50+ elevated", "35+ high", "below 35 very high"][i]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-3xl text-sm text-ink-2">
            Each check scores 0–100 (higher is safer) and the grade is their weighted average. Serious red flags cap the grade no matter how good the rest looks: a token under a week
            old can&apos;t score above C, an owner that can mint can&apos;t score above D, a hack in the last year caps a protocol at C.
          </p>
          <details className="group mt-4">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-line px-4 py-2 text-sm text-ink-2 hover:border-ink hover:text-ink">
              <span className="group-open:hidden">See every check we run</span>
              <span className="hidden group-open:inline">Hide the checks</span>
              <span aria-hidden="true" className="transition group-open:rotate-180">
                ▾
              </span>
            </summary>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {METHOD.map((m) => (
                <li key={m.t} className="card p-4">
                  <h3 className="font-display font-semibold">{m.t}</h3>
                  <p className="mt-1 text-sm text-ink-2">{m.d}</p>
                </li>
              ))}
            </ul>
          </details>
          <p className="mt-6 max-w-3xl rounded-md border border-line p-4 text-sm text-ink-2">
            <b className="text-ink">Not financial advice.</b> A rating describes risk signals we can measure; it can&apos;t see everything (team intent, off-chain deals, future bugs). A good grade
            is not a promise, and a low grade is not an accusation. Risk is part of investing: make it informed.
          </p>
          <p className="mt-4 text-sm text-ink-2">
            For agents: the same report over x402 for 0.002 USDC at <code className="font-mono text-ink">/api/x402/risk?target=…</code>, or the <code className="font-mono text-ink">fuci_risk</code>{" "}
            MCP tool. <Link href="/docs" className="underline underline-offset-2">Docs</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
