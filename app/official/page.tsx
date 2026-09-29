import type { Metadata } from "next";
import { CANONICAL_URL, CONTACT_EMAIL, EXPLORER_URL, FUCI_TOKEN, GITHUB_URL, X_URL } from "@/lib/config";
import { CopyButton } from "@/components/CopyButton";
import { LISTINGS } from "@/components/ListedOn";

export const metadata: Metadata = {
  title: { absolute: "Official links & $FUCI contract · Fuci" },
  description: "The only official $FUCI contract, website, social accounts and contact for Fuci. Use this page to verify listings and avoid impersonators.",
};

const OFFICIAL = [
  { label: "Website", value: CANONICAL_URL.replace("https://", ""), href: CANONICAL_URL },
  { label: "X (Twitter)", value: `@${X_URL.split("/").pop()}`, href: X_URL },
  { label: "GitHub", value: GITHUB_URL.replace("https://", ""), href: GITHUB_URL },
  { label: "Email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
  { label: "ERC-8004 agent", value: "Fuci · agent #196 on Arc", href: "https://8004scan.io/agents/arc/196" },
];

/** One public page listing Fuci's official contract and accounts, for listing sites and users to check against. */
export default function OfficialPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="eyebrow">Official links</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">$FUCI contract & official accounts</h1>
      <p className="mt-3 text-ink-2">
        These are the only official Fuci contract, website and accounts. Anything else claiming to be Fuci is not us. We never DM first and never ask for your keys or seed phrase.
      </p>

      <section className="card mt-8 p-5 sm:p-6">
        <p className="text-xs uppercase tracking-widest text-muted">$FUCI token contract · Arc mainnet (chain 5042)</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="break-all font-mono text-sm text-ink sm:text-base">{FUCI_TOKEN}</code>
          <CopyButton text={FUCI_TOKEN} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <a className="btn btn-ghost !py-1.5" href={`${EXPLORER_URL}/address/${FUCI_TOKEN}`} target="_blank" rel="noreferrer">
            Arc explorer ↗
          </a>
          <a className="btn btn-ghost !py-1.5" href={`https://dexscreener.com/arc/${FUCI_TOKEN}`} target="_blank" rel="noreferrer">
            DexScreener ↗
          </a>
          <a className="btn btn-ghost !py-1.5" href={`https://argus.world/token/${FUCI_TOKEN}`} target="_blank" rel="noreferrer">
            Argus ↗
          </a>
        </div>
        <p className="mt-4 text-xs text-muted">Symbol FUCI · Name Fuci · Launched on Argus, trades against USDC on Uniswap v4.</p>
      </section>

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Official accounts</h2>
        <dl className="mt-4 divide-y divide-line/60 text-sm">
          {OFFICIAL.map((o) => (
            <div key={o.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-muted">{o.label}</dt>
              <dd>
                <a href={o.href} target={o.href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer" className="break-all font-mono text-ink hover:underline">
                  {o.value}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card mt-4 p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Listed on</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {LISTINGS.map((l) => (
            <li key={l.label}>
              <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-ink hover:text-ink">
                {l.label} ↗
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">Listing requests (for example CoinMarketCap) are only ever sent from {CONTACT_EMAIL} and confirmed from our X account.</p>
      </section>
    </main>
  );
}
