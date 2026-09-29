import type { Metadata } from "next";
import Link from "next/link";
import { EARN_FEE_PCT, earnVaults, type Vault } from "@/lib/earn";

export const metadata: Metadata = {
  title: { absolute: "Earn: yield on idle USDC and EURC · Fuci" },
  description:
    "Put your agent's idle USDC or EURC into lending vaults on Arc with Circle's Earn Kit. Non-custodial, withdraw any time. Live APY, TVL and liquidity for every vault.",
};

export const dynamic = "force-dynamic";

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const money = (n: number) => `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
const protocol = (p: string) => (p === "MORPHO" ? "Morpho" : p.charAt(0) + p.slice(1).toLowerCase());

function Table({ vaults }: { vaults: Vault[] }) {
  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-3 font-normal">Vault</th>
            <th className="px-4 py-3 font-normal">APY</th>
            <th className="px-4 py-3 font-normal">Deposits</th>
            <th className="px-4 py-3 font-normal">Available to withdraw</th>
            <th className="px-4 py-3 font-normal">Vault fee</th>
          </tr>
        </thead>
        <tbody>
          {vaults.map((v) => (
            <tr key={v.address} className="border-t border-line/60">
              <td className="px-4 py-3">
                <a href={`https://explorer.arc.io/address/${v.address}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {v.name}
                </a>
                <span className="ml-2 font-mono text-[11px] text-muted">{protocol(v.protocol)}</span>
                {v.status !== "active" && <span className="ml-2 rounded border border-line px-1.5 font-mono text-[10px] uppercase text-danger">low liquidity</span>}
              </td>
              <td className="px-4 py-3 font-mono tabular-nums text-up">{pct(v.apy)}</td>
              <td className="px-4 py-3 font-mono tabular-nums">{money(v.tvl)}</td>
              <td className="px-4 py-3 font-mono tabular-nums">{money(v.liquidity)}</td>
              <td className="px-4 py-3 font-mono tabular-nums">{pct(v.vaultFee)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function EarnPage() {
  const vaults = await earnVaults().catch(() => null);
  const usdc = vaults?.filter((v) => v.asset === "USDC") ?? [];
  const eurc = vaults?.filter((v) => v.asset === "EURC") ?? [];
  const best = vaults?.filter((v) => v.status === "active")[0];

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="eyebrow flex items-center gap-2">
          <span className="live-dot" /> Live on Arc · Circle Earn Kit
        </p>
        <h1 className="font-display mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Idle USDC shouldn&apos;t sit still.</h1>
        <p className="mt-4 max-w-2xl text-ink-2">
          Your agent can put the USDC or EURC it isn&apos;t using into a lending vault on Arc and earn yield until it needs it. The vault holds the money, not Fuci, and only
          your agent&apos;s wallet can take it out, any time.
          {best ? ` Best active vault right now: ${best.name} at ${pct(best.apy)} APY.` : ""}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/spawn" className="btn btn-primary">
            Use it with your agent
          </Link>
          <a href="#how" className="btn btn-ghost">
            How it works
          </a>
        </div>

        {!vaults ? (
          <p className="card mt-10 p-6 text-sm text-ink-2">The vault list is unavailable right now. Refresh in a minute.</p>
        ) : (
          <>
            <section className="mt-12">
              <h2 className="font-display text-2xl font-semibold tracking-tight">USDC vaults</h2>
              <p className="mt-1 text-sm text-ink-2">APY is after the vault&apos;s own fees and changes with lending demand. It is not guaranteed.</p>
              <Table vaults={usdc} />
            </section>
            {eurc.length > 0 && (
              <section className="mt-10">
                <h2 className="font-display text-2xl font-semibold tracking-tight">EURC vaults</h2>
                <Table vaults={eurc} />
              </section>
            )}
          </>
        )}

        <section id="how" className="mt-14 scroll-mt-24">
          <h2 className="font-display text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["Deposit", "On your agent's page, pick a vault and an amount. The agent's USDC (or EURC) goes into the vault and it gets vault shares back."],
              ["Earn", "The shares grow as borrowers pay interest to the underlying lending protocol. You see the balance and what it earned on the agent page."],
              ["Take out", "One tap redeems the shares back to the agent wallet: the deposit plus the yield. The autopilot can use it again right away."],
            ].map(([t, d], i) => (
              <li key={t} className="card p-5">
                <p className="font-mono text-xs text-muted">0{i + 1}</p>
                <p className="font-display mt-2 text-lg font-semibold">{t}</p>
                <p className="mt-1 text-sm text-ink-2">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 grid gap-3 md:grid-cols-2">
          <div className="card p-5">
            <h2 className="font-semibold">Fees</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              <li>No fee to deposit.</li>
              <li>The vault&apos;s curator takes a performance and management fee from the yield; the APY shown already includes it.</li>
              <li>
                <b className="text-ink">Fuci takes {EARN_FEE_PCT}% of the yield</b> when you take it out, paid to the Fuci treasury. Never from your deposit, and nothing if the
                position didn&apos;t earn.
              </li>
            </ul>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">Risks</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              <li>Vaults lend to borrowers through a DeFi protocol. In extreme markets a vault can lose value, and your deposit can come back smaller.</li>
              <li>A vault with low available liquidity may not let you take everything out at once. Fuci only deposits into vaults marked active.</li>
              <li>Test vaults and vaults under $1K of deposits are hidden. Listing is not an endorsement: check a vault before you use it.</li>
            </ul>
          </div>
        </section>

        <p className="mt-8 font-mono text-[11px] text-muted">
          Vaults and rates from Circle&apos;s Earn Kit on Arc mainnet, refreshed every 5 minutes. JSON at{" "}
          <a className="underline" href="/api/earn">
            /api/earn
          </a>
          . Not financial advice.
        </p>
      </div>
    </main>
  );
}
