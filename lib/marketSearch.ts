/** Market listing type and search, shared by the server and the /market page. */

export type Listing = {
  id: string;
  name: string;
  description: string;
  url: string;
  method: "GET" | "POST";
  /** USDC per call on Arc. */
  priceUsdc: number;
  payTo: string;
  /** Every network the seller accepts, readable ("Arc", "Base", …). */
  networks: string[];
  seller: { name: string; host: string; agentId: number | null };
  source: "fuci" | "erc8004" | "catalogue" | "submitted";
  /** When the listing last answered 402 with an Arc price. */
  checkedAt: number;
};

/** Search the market (name, description, seller, URL). Cheapest first within equal relevance. */
export function searchMarket(listings: Listing[], q: string) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return listings;
  return listings
    .map((l) => {
      const hay = `${l.name} ${l.description} ${l.seller.name} ${l.seller.host} ${l.url}`.toLowerCase();
      return { l, score: terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.l.priceUsdc - b.l.priceUsdc)
    .map((x) => x.l);
}
