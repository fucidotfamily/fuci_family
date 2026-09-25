import { FUCI_LAUNCH, FUCI_TOKEN } from "@/lib/config";
import { argusTokenUrl, getBonding, type BondingState } from "@/lib/argus";
import { CopyButton } from "./CopyButton";

const STAGES = [
  { name: "Spore", range: "0–25%", body: "Launched on Argus with real Uniswap v4 liquidity from the first block. Every buy is USDC." },
  { name: "Holdfast", range: "25–50%", body: "The community anchors. Agents start watching the curve." },
  { name: "Frond", range: "50–99%", body: "Branching out. The price climbs toward the bond tick." },
  { name: "Kelp Forest", range: "Bonded", body: "Crossed the bond tick: bonded for good. Taxes keep paying holders and the creator in USDC." },
];

function stageIndex(p: number, bonded: boolean) {
  if (bonded) return 3;
  if (p >= 0.5) return 2;
  if (p >= 0.25) return 1;
  return 0;
}

// $FUCI's contract address on the Arc mainnet explorer (Argus is mainnet-only).
const mainnetAddress = (a: string) => `https://explorer.arc.io/address/${a}`;

export async function FuciToken() {
  let curve: BondingState | null = null;
  let error: string | null = null;
  if (FUCI_TOKEN) {
    try {
      curve = (await getBonding(FUCI_TOKEN)).data;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <section id="fuci" className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="fuci-title">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="eyebrow">$FUCI × Argus</p>
          <h2 id="fuci-title" className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Seeded on Argus. Grown by agents.
          </h2>
          <p className="mt-4 text-ink-2">
            $FUCI launches on{" "}
            <a href="https://argus.world" target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
              Argus
            </a>
            , the token launchpad on Arc: a Uniswap v4 pool from the first block, with taxes paid back in USDC. Argus is also what Fuci
            agents watch and trade, so the token and the agents grow together.
          </p>
          {FUCI_TOKEN && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <code className="rounded bg-surface-2 px-3 py-2 font-mono text-xs break-all">{FUCI_TOKEN}</code>
              <CopyButton text={FUCI_TOKEN} />
              <a href={mainnetAddress(FUCI_TOKEN)} target="_blank" rel="noreferrer" className="text-sm text-ink hover:underline">
                Explorer
              </a>
            </div>
          )}
          {FUCI_TOKEN ? (
            <a href={argusTokenUrl(FUCI_TOKEN)} target="_blank" rel="noreferrer" className="btn btn-primary mt-6">
              Buy on Argus ↗
            </a>
          ) : (
            <p className="mt-6 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted">
              <span className="live-dot" /> Launching soon on Argus
            </p>
          )}
          {Tokenomics()}
        </div>

        <div className="card reveal p-6">
          {!FUCI_TOKEN ? (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <p className="eyebrow">Coming soon</p>
                <p className="font-display mt-3 text-3xl font-semibold">$FUCI is still a spore.</p>
                <p className="mt-3 text-ink-2">The contract address and live bonding progress appear here the moment it launches on Argus.</p>
              </div>
            </div>
          ) : !curve ? (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <p className="font-display text-2xl font-semibold">Pool unavailable right now</p>
                <p className="mt-2 break-words text-sm text-muted">{error}</p>
              </div>
            </div>
          ) : (
            CurveCard({ curve })
          )}
        </div>
      </div>
    </section>
  );
}

function CurveCard({ curve }: { curve: BondingState }) {
  const idx = stageIndex(curve.progress, curve.bonded);
  const pct = Math.round(curve.progress * 100);
  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="font-display text-2xl font-semibold">${curve.symbol}</p>
        <p className="font-mono text-xs text-muted">live · Arc mainnet</p>
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-sm bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to bonding">
        <div className="h-full rounded-sm bg-up" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 font-mono text-xs text-muted">
        {curve.priceUsdc.toPrecision(3)} USDC · {pct}% to bonding · tax {curve.buyTaxPct}% / {curve.sellTaxPct}%
      </p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2">
        {STAGES.map((s, i) => (
          <li key={s.name} className={`rounded-md border p-4 ${i === idx ? "border-ink bg-surface-2" : "border-line"} ${i > idx ? "opacity-60" : ""}`}>
            <p className="flex items-center justify-between">
              <span className="font-display text-lg font-semibold">{s.name}</span>
              <span className="font-mono text-[11px] text-muted">{s.range}</span>
            </p>
            <p className="mt-1 text-sm text-ink-2">{s.body}</p>
          </li>
        ))}
      </ol>
    </>
  );
}

/** $FUCI's launch settings: fixed forever once it launches on Argus. */
function Tokenomics() {
  const t = FUCI_LAUNCH;
  const devTokens = (t.supply * t.devBuyPct) / 100;
  const tiles = [
    [`${t.buyTaxPct}%`, "buy tax"],
    [`${t.sellTaxPct}%`, "sell tax"],
    [`${t.devBuyPct}%`, `dev buy · ${devTokens / 1e6}M $FUCI`],
  ];
  return (
    <div className="card mt-8 p-5">
      <p className="eyebrow">Tokenomics</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tiles.map(([v, l]) => (
          <div key={l} className="rounded-md border border-line p-3">
            <p className="font-display text-2xl font-semibold">{v}</p>
            <p className="mt-0.5 text-xs text-muted">{l}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-sm font-semibold">Where the tax goes</p>
      <div className="mt-2 flex h-3 overflow-hidden rounded-sm" role="img" aria-label={`${t.split.dividendsPct}% dividends, ${t.split.creatorPct}% creator funds`}>
        <div className="h-full bg-up" style={{ width: `${t.split.dividendsPct}%` }} />
        <div className="h-full bg-ink" style={{ width: `${t.split.creatorPct}%` }} />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex items-baseline gap-2">
          <span className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-up" aria-hidden />
          <b>{t.split.dividendsPct}%</b> dividends <span className="text-ink-2">· paid to holders in USDC</span>
        </li>
        <li className="flex flex-wrap items-baseline gap-x-2">
          <span className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-ink" aria-hidden />
          <b>{t.split.creatorPct}%</b> creator funds{" "}
          <a href={t.creatorFundsTo.url} target="_blank" rel="noreferrer" className="text-ink-2 underline underline-offset-2">
            → {t.creatorFundsTo.label}
          </a>
        </li>
        <li className="text-xs text-muted">
          Buyback &amp; burn {t.split.buybackPct}% · liquidity {t.split.liquidityPct}%
        </li>
      </ul>
      <p className="mt-4 text-xs text-muted">
        Argus keeps {t.argusCutPct}% of every tax; the split above applies to the other {100 - t.argusCutPct}%. Taxes and split are fixed forever at launch. Supply{" "}
        {t.supply / 1e9}B.
      </p>
    </div>
  );
}
