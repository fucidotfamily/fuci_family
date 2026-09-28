import Link from "next/link";
import { TOOLS } from "@/lib/tools";
import { SITE_URL, X402_NETWORKS } from "@/lib/config";
import { planCost } from "@/lib/agent";
import { CopyButton } from "./CopyButton";

const I = ({ d }: { d: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-7 w-7"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

/** Prices come from the tool catalog, so they always match what agents are charged. */
const perRun = (strategy: "scout" | "watcher" | "oracle") =>
  `$${Number(planCost(strategy).toFixed(4))} / run`;

const STRATEGIES = [
  {
    name: "Launch Scout",
    price: perRun("scout"),
    body: "Spots every new token on Argus, the launchpad on Arc, with who launched it and its buy and sell tax.",
    icon: (
      <I
        d={
          <>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
          </>
        }
      />
    ),
  },
  {
    name: "Bonding Watcher",
    price: perRun("watcher"),
    body: "Follows Argus pools and flags tokens close to bonding. A run reads new launches, then their bonding.",
    icon: (
      <I
        d={
          <>
            <path d="M3 20h18" />
            <path d="M5 16l4-5 3 3 6-8" />
            <path d="M15 6h3v3" />
          </>
        }
      />
    ),
  },
  {
    name: "Tide Oracle",
    price: perRun("oracle"),
    body: "Reads the net USDC flow across new Argus tokens and sums up the market mood in one sentence.",
    icon: (
      <I
        d={
          <>
            <path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0" />
            <path d="M2 17c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0" />
            <path d="M12 3v5" />
          </>
        }
      />
    ),
  },
];

const MORE = [
  {
    href: "/risk",
    title: "Check the risk first",
    body: "A free A–F grade for any Arc token or DeFi protocol, every number sourced. Agents pay 0.002 USDC per check.",
  },
  {
    href: "/kya",
    title: "Know Your Agent",
    body: "Check any AI agent before you pay or trust it: ERC-8004 identity, reputation, wallet history, payment record.",
  },
  {
    href: "/spawn",
    title: "Trade Argus on autopilot",
    body: "Smart entry that skips obvious rugs, DCA any token, take profit, trailing stop, and a PnL card to share.",
    tag: "new",
  },
  {
    href: "/escrow",
    title: "Hire with escrow",
    body: "Lock USDC for a job. The agent is paid when the work is in, or you get it back.",
    tag: "soon",
  },
  {
    href: "/market",
    title: "Buy from other agents",
    body: "Every paid API on Arc, checked live. Your agent can buy from it on its own, capped and KYA-checked.",
  },
  {
    href: "/docs#mcp",
    title: "Use it from Claude or Cursor",
    body: "One MCP config line. Your wallet pays, with a spending cap.",
  },
];

export function Capabilities({ escrowLive = false, page = false }: { escrowLive?: boolean; page?: boolean }) {
  const Title = page ? "h1" : "h2";
  const curl = `curl -i ${SITE_URL}/api/x402/argus/launches`;
  return (
    <section
      id="tools"
      className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
      aria-labelledby="cap-title"
    >
      <p className="eyebrow">What your agent can do</p>
      <Title
        id="cap-title"
        className="font-display mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl"
      >
        Watch the market. Pay per look.
      </Title>
      <p className="mt-4 max-w-2xl text-ink-2">
        Pick a strategy when you spawn. Each run buys only the on-chain data it
        needs, for fractions of a cent.
      </p>

      <ul className="mt-10 grid gap-3 md:grid-cols-3">
        {STRATEGIES.map((s) => (
          <li key={s.name} className="card reveal flex flex-col p-6">
            <div className="flex items-start justify-between">
              <span className="text-ink">{s.icon}</span>
              <span className="rounded border border-line px-2 py-0.5 font-mono text-[11px] text-ink-2">
                {s.price}
              </span>
            </div>
            <h3 className="font-display mt-5 text-xl font-semibold">
              {s.name}
            </h3>
            <p className="mt-2 text-sm text-ink-2">{s.body}</p>
          </li>
        ))}
      </ul>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MORE.map((m) => ({ ...m, tag: m.href === "/escrow" && escrowLive ? "new" : m.tag })).map((m) => (
          <li key={m.href}>
            <Link
              href={m.href}
              className="card reveal group flex h-full flex-col p-5 transition hover:border-ink"
            >
              <span className="flex items-center justify-between gap-2 font-medium">
                {m.title}
                <span
                  className="text-muted transition group-hover:translate-x-0.5 group-hover:text-ink"
                  aria-hidden="true"
                >
                  →
                </span>
              </span>
              <span className="mt-1 text-sm text-ink-2">
                {m.body}{" "}
                {m.tag && (
                  <span className="ml-1 rounded border border-line px-1.5 font-mono text-[10px] uppercase text-muted">
                    {m.tag}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="card reveal mt-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">
            <b className="text-ink">For builders:</b> every tool is a plain x402
            endpoint any agent can pay in USDC, from Arc or{" "}
            {X402_NETWORKS.length - 1} other chains through Circle Gateway.
            100/100 on Circle&apos;s agent-readiness check.
          </p>
          <span className="flex gap-4 text-sm">
            <a
              href="/openapi.json"
              className="text-ink underline underline-offset-2"
            >
              openapi.json
            </a>
            <Link
              href="/docs"
              className="text-ink underline underline-offset-2"
            >
              Docs
            </Link>
          </span>
        </div>
        <ul className="mt-3 grid gap-x-6 gap-y-1 font-mono text-xs text-ink-2 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <li key={t.id} className="flex justify-between gap-3 truncate">
              <span className="truncate">
                {t.method} {t.path}
              </span>
              <span className="shrink-0 text-muted">{t.price}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-surface-2 px-3 py-2 text-xs text-ink-2">
            {curl}
          </pre>
          <CopyButton text={curl} />
        </div>
      </div>
    </section>
  );
}
