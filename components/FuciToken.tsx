import { FUCI_LAUNCH, FUCI_TOKEN } from "@/lib/config";
import { argusTokenUrl, getBonding, type BondingState } from "@/lib/argus";
import { fuciMarket, type Market } from "@/lib/publicStats";
import { CopyButton } from "./CopyButton";

// $FUCI lives on Arc mainnet (Argus is mainnet-only).
const EXPLORER = "https://explorer.arc.io";
const DEXSCREENER = `https://dexscreener.com/arc/${FUCI_TOKEN}`;

const JOURNEY = ["Spore", "Holdfast", "Frond", "Kelp Forest"];

const compact = (n: number) => `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** $FUCI on the home page: bonded on Argus, live market numbers, recent trades, and how holding pays. */
export async function FuciToken() {
  const [curve, market] = await Promise.all([
    getBonding(FUCI_TOKEN)
      .then((r) => r.data)
      .catch(() => null),
    fuciMarket().catch(() => null),
  ]);
  const bonded = curve?.bonded ?? false;

  return (
    <section id="fuci" className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="fuci-title">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="eyebrow">$FUCI × Argus</p>
          <h2 id="fuci-title" className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            {bonded ? "Bonded. Now it pays holders." : "Seeded on Argus. Grown by agents."}
          </h2>
          <p className="mt-4 text-ink-2">
            $FUCI launched on{" "}
            <a href="https://argus.world" target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
              Argus
            </a>
            , the token launchpad on Arc{bonded ? ", and crossed its bond tick: it is bonded for good" : ""}. Every trade pays a {FUCI_LAUNCH.buyTaxPct}% tax, and{" "}
            {FUCI_LAUNCH.split.dividendsPct}% of the creator share goes back to holders as USDC. Argus is also what Fuci agents watch and trade, so the token and the
            agents grow together.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface-2 px-3 py-2 font-mono text-xs break-all">{FUCI_TOKEN}</code>
            <CopyButton text={FUCI_TOKEN} />
            <a href={`${EXPLORER}/address/${FUCI_TOKEN}`} target="_blank" rel="noreferrer" className="text-sm text-ink hover:underline">
              Explorer
            </a>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <a href={argusTokenUrl(FUCI_TOKEN)} target="_blank" rel="noreferrer" className="btn btn-primary">
              Buy on Argus ↗
            </a>
            <a href={DEXSCREENER} target="_blank" rel="noreferrer" className="btn btn-ghost">
              Chart on DexScreener ↗
            </a>
          </div>

          {HowItPays()}
        </div>

        <div className="space-y-4">
          {LiveCard({ curve, market })}
          {Tokenomics()}
        </div>
      </div>
    </section>
  );
}

function LiveCard({ curve, market }: { curve: BondingState | null; market: Market | null }) {
  const bonded = curve?.bonded ?? false;
  const stage = bonded ? 3 : curve ? (curve.progress >= 0.5 ? 2 : curve.progress >= 0.25 ? 1 : 0) : -1;
  const tiles: [string, string][] = [
    ["Price", market ? `${usd(market.priceUsd * 1e6)}` : curve ? `${usd(curve.priceUsdc * 1e6)}` : "—"],
    ["Market cap", market ? compact(market.marketCapUsd) : "—"],
    ["Liquidity", market ? compact(market.liquidityUsd) : "—"],
    ["24h volume", market ? compact(market.volume24hUsd) : "—"],
  ];

  return (
    <div className="card reveal p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-2xl font-semibold">$FUCI</p>
        <div className="flex flex-wrap gap-2">
          {bonded ? (
            <span className="rounded-full border border-up bg-up/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-up">✓ Bonded</span>
          ) : (
            <span className="font-mono text-xs text-muted">live · Arc mainnet</span>
          )}
          <a
            href={FUCI_LAUNCH.devLock.url}
            target="_blank"
            rel="noreferrer"
            title={`Unlocks ${FUCI_LAUNCH.devLock.until}`}
            className="rounded-full border border-up bg-up/10 px-3 py-1 font-mono text-xs uppercase tracking-widest text-up hover:underline"
          >
            🔒 Dev locked {FUCI_LAUNCH.devLock.period}
          </a>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-md border border-line p-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-display mt-1 text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 font-mono text-[11px] text-muted">
        Price per 1M $FUCI.{" "}
        {market ? (
          <a href={market.url} target="_blank" rel="noreferrer" className="underline">
            {market.txns24h.toLocaleString("en-US")} trades in 24h · DexScreener
          </a>
        ) : (
          "Market data from DexScreener."
        )}
      </p>

      {/* The journey: every stage done once bonded */}
      <ol className="mt-6 flex items-center gap-1" aria-label="Launch journey">
        {JOURNEY.map((name, i) => (
          <li key={name} className="flex flex-1 flex-col gap-1.5">
            <span className={`h-1.5 rounded-full ${i <= stage ? "bg-up" : "bg-surface-2"}`} />
            <span className={`font-mono text-[10px] uppercase tracking-widest ${i === stage ? "text-ink" : "text-muted"}`}>
              {i <= stage ? "✓ " : ""}
              {name}
            </span>
          </li>
        ))}
      </ol>

      {curve && curve.trades.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold">Latest trades</p>
          <ul className="mt-2 divide-y divide-line text-sm">
            {curve.trades.slice(0, 5).map((t) => (
              <li key={t.tx} className="flex items-center gap-3 py-2">
                <span className={`w-10 font-mono text-xs uppercase ${t.side === "buy" ? "text-up" : "text-danger"}`}>{t.side}</span>
                <span className="flex-1 tabular-nums">{usd(t.usdc)}</span>
                <a href={`${EXPLORER}/tx/${t.tx}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-muted hover:text-ink hover:underline">
                  {t.tx.slice(0, 8)}… ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** How holding $FUCI earns USDC (Argus' revenue splitter). */
function HowItPays() {
  const t = FUCI_LAUNCH;
  const steps = [
    ["Every trade is taxed", `${t.buyTaxPct}% on buys, ${t.sellTaxPct}% on sells, paid in USDC. Fixed forever at launch.`],
    ["Holders get the biggest share", `Argus keeps ${t.argusCutPct}%. Of the rest, ${t.split.dividendsPct}% is credited to $FUCI holders, by how much they hold.`],
    ["Claim your USDC", "Dividends build up while you hold. Claim them any time on the $FUCI page on Argus."],
  ];
  return (
    <ol className="mt-10 space-y-4">
      {steps.map(([title, body], i) => (
        <li key={title} className="flex gap-4">
          <span className="font-display grid size-8 shrink-0 place-items-center rounded-full border border-line text-sm font-semibold">{i + 1}</span>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="mt-0.5 text-sm text-ink-2">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** $FUCI's launch settings: fixed forever on Argus. */
function Tokenomics() {
  const t = FUCI_LAUNCH;
  const devTokens = (t.supply * t.devBuyPct) / 100;
  const tiles = [
    [`${t.buyTaxPct}%`, "buy tax"],
    [`${t.sellTaxPct}%`, "sell tax"],
    [`${t.devBuyPct}%`, `dev buy · ${devTokens / 1e6}M $FUCI · locked`],
  ];
  return (
    <div className="card p-5">
      <p className="eyebrow">Tokenomics</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tiles.map(([v, l]) => (
          <div key={l} className="rounded-md border border-line p-3">
            <p className="font-display text-2xl font-semibold">{v}</p>
            <p className="mt-0.5 text-xs text-muted">{l}</p>
          </div>
        ))}
      </div>

      <a
        href={t.devLock.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-up/50 bg-up/5 p-3 text-sm hover:border-up"
      >
        <span aria-hidden>🔒</span>
        <span>
          <b>Dev bag locked for {t.devLock.period}</b> <span className="text-ink-2">· {(t.devLock.tokens / 1e6).toFixed(1)}M $FUCI, the whole dev wallet</span>
        </span>
        <span className="ml-auto font-mono text-xs text-up">unlocks {t.devLock.until} ↗</span>
      </a>

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
      </ul>
      <p className="mt-4 text-xs text-muted">
        Argus keeps {t.argusCutPct}% of every tax; the split above applies to the other {100 - t.argusCutPct}%. Supply {t.supply / 1e9}B.
      </p>
    </div>
  );
}
