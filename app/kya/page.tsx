import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RiskReportView } from "@/components/RiskReportView";
import { getKya, KyaInputError } from "@/lib/kya";
import { storedIndex } from "@/lib/agentIndex";

export const metadata: Metadata = {
  title: { absolute: "Know Your Agent: check an AI agent before you trust it · Fuci" },
  description:
    "Free A–F trust grade for any AI agent on Arc: its ERC-8004 identity, registration file, on-chain reputation and validations, wallet activity and x402 payment record. Every number sourced.",
};

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Props = { searchParams: Promise<{ [k: string]: string | string[] | undefined }> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A wallet that pays Fuci's tools on its own, used as a live example. */
const EXAMPLE_PAYER = "0xaf6a0084296e759b4457443b9f88f21ae57d9a3c";

async function Report({ agent }: { agent: string }) {
  const result = await getKya(agent).then(
    (r) => ({ r, error: null }),
    (e: unknown) => ({ r: null, error: e instanceof KyaInputError ? e.message : "We couldn't finish this check right now (Arc didn't answer). Try again in a minute." }),
  );
  if (!result.r) {
    return (
      <div className="card mt-8 p-5 text-sm text-ink-2" role="alert">
        <b className="text-ink">No report.</b> {result.error}
      </div>
    );
  }
  const s = result.r.subject;
  const rows: [string, React.ReactNode][] = [
    ["ERC-8004 id", s.agentId !== null ? `#${s.agentId}` : "None"],
    ["Wallet", <a key="w" href={s.explorer} target="_blank" rel="noreferrer" className="break-all font-mono underline underline-offset-2">{s.wallet}</a>],
    ...(s.owner && s.owner.toLowerCase() !== s.wallet.toLowerCase() ? [["Owner", <span key="o" className="break-all font-mono">{s.owner}</span>] as [string, React.ReactNode]] : []),
    ["x402 support", s.x402Support ? "Declared" : "Not declared"],
    ...(s.builtOnFuci ? [["Built on", "Fuci"] as [string, React.ReactNode]] : []),
    ...(s.otherAgentIds.length ? [["Same wallet", s.otherAgentIds.map((i) => `#${i}`).join(", ")] as [string, React.ReactNode]] : []),
  ];
  return (
    <>
      <RiskReportView r={result.r} />
      <dl className="card mt-3 grid grid-cols-1 gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted">{k}</dt>
            <dd className="mt-0.5 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function Loading() {
  return (
    <div className="card mt-8 p-6" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <span className="live-dot" /> Reading the ERC-8004 registries and the wallet on Arc…
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

const METHOD: { t: string; d: string; w: number }[] = [
  { t: "On-chain identity", w: 25, d: "Is it registered in the ERC-8004 Identity Registry on Arc? Which wallet does it pay from, and who owns it? A wallet with no identity can't score above D." },
  { t: "Reputation", w: 25, d: "Feedback left on-chain by clients in the ERC-8004 Reputation Registry. Until 3 clients have rated it, the score leans toward neutral." },
  { t: "Registration file", w: 15, d: "The agent's public card: name, description, image, service endpoints, x402 support and trust model." },
  { t: "Wallet activity", w: 15, d: "How many transactions its wallet has sent on Arc, and whether it's a smart-contract wallet. A wallet that never sent one can't score above D." },
  { t: "x402 payment record", w: 10, d: "Paid calls Fuci has settled from this wallet through Circle Gateway: proof it pays its way." },
  { t: "Validation & funds", w: 10, d: "Independent validator checks in the ERC-8004 Validation Registry, and the USDC it holds on Arc." },
];

export default async function KyaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const agent = one(sp.agent);
  const top = agent ? [] : ((await storedIndex().catch(() => null))?.index?.agents ?? []).filter((a) => a.name).sort((a, b) => a.rank - b.rank).slice(0, 4);

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="eyebrow flex items-center gap-2">
          <span className="live-dot" /> Know Your Agent
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Check an agent before you trust it.</h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          Agents now pay, hire and sell to each other. Before yours sends money to one, see who it is: its on-chain identity, reputation, wallet history and payment record on Arc,
          graded A–F. Free, and every number links to its source.
        </p>

        <form action="/kya" method="get" role="search" className="mt-8 flex max-w-3xl flex-col gap-2 sm:flex-row">
          <label htmlFor="kya-q" className="sr-only">
            Agent id or wallet address
          </label>
          <input
            id="kya-q"
            name="agent"
            defaultValue={agent}
            required
            placeholder="ERC-8004 agent id (e.g. 12) or wallet address (0x…)"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-4 py-3 font-mono text-sm text-ink outline-none focus:border-ink"
          />
          <button type="submit" className="btn btn-primary justify-center !py-3">
            Check agent
          </button>
        </form>
        <div className="mt-3 flex max-w-3xl flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Try:</span>
          <Link href={`/kya?agent=${EXAMPLE_PAYER}`} className="rounded-full border border-line px-3 py-1 font-mono text-ink-2 hover:border-ink hover:text-ink">
            {short(EXAMPLE_PAYER)}
          </Link>
          {top.map((a) => (
            <Link key={a.agentId} href={`/kya?agent=${a.agentId}`} className="max-w-[14rem] truncate rounded-full border border-line px-3 py-1 text-ink-2 hover:border-ink hover:text-ink">
              #{a.agentId} {a.name}
            </Link>
          ))}
        </div>

        {agent && (
          <Suspense key={agent} fallback={<Loading />}>
            <Report agent={agent} />
          </Suspense>
        )}

        <section className="mt-16" aria-labelledby="method">
          <h2 id="method" className="font-display text-2xl font-semibold tracking-tight">
            What we check
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {METHOD.map((m) => (
              <li key={m.t} className="card p-4">
                <h3 className="flex items-baseline justify-between gap-3 font-display font-semibold">
                  {m.t} <span className="font-mono text-xs font-normal text-muted">{m.w}%</span>
                </h3>
                <p className="mt-1 text-sm text-ink-2">{m.d}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-3xl rounded-md border border-line p-4 text-sm text-ink-2">
            <b className="text-ink">A grade is a signal, not a guarantee.</b> It shows what can be measured on-chain today. A new agent starts low because it has no history yet, not
            because it did anything wrong. Unknown checks are shown as Unknown, never guessed.
          </p>
          <p className="mt-4 text-sm text-ink-2">
            For agents: the same report over x402 for 0.002 USDC at <code className="font-mono text-ink">/api/x402/kya?agent=…</code>, or the{" "}
            <code className="font-mono text-ink">fuci_kya</code> MCP tool. <Link href="/docs" className="underline underline-offset-2">Docs</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
