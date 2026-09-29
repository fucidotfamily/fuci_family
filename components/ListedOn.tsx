import { FUCI_TOKEN } from "@/lib/config";

/** Where Fuci is listed today (each link checked live). CoinMarketCap is added once it approves. */
export const LISTINGS = [
  { label: "CoinGecko", href: "https://www.coingecko.com/en/coins/fuci" },
  { label: "DefiLlama", href: "https://defillama.com/protocol/fuci" },
  { label: "DexScreener", href: `https://dexscreener.com/arc/${FUCI_TOKEN}` },
  { label: "Argus", href: `https://argus.world/token/${FUCI_TOKEN}` },
  { label: "x402scan", href: "https://www.x402scan.com/server/43f91264-a63e-4ef9-84a4-17bcd00e411e" },
  { label: "Smithery (MCP)", href: "https://smithery.ai/servers/fuci/fuci" },
];

export function ListedOn() {
  return (
    <section aria-label="Listed on" className="border-y border-line bg-surface/40">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5 sm:px-6">
        <p className="eyebrow shrink-0">Listed on</p>
        <ul className="flex flex-wrap gap-2">
          {LISTINGS.map((l) => (
            <li key={l.label}>
              <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-ink hover:text-ink">
                {l.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
