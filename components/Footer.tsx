import Link from "next/link";
import { Logo } from "./Logo";
import { CopyButton } from "./CopyButton";
import { CONTACT_EMAIL, FUCI_TOKEN, GITHUB_URL, SHOW_FUCI_TOKEN, X_HANDLE, X_URL } from "@/lib/config";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["Spawn an agent", "/spawn"],
      ["Agent directory", "/agents"],
      ["What agents can do", "/tools"],
      ["Earn", "/earn"],
      ["Market", "/market"],
      ["Escrow", "/escrow"],
    ],
  },
  {
    title: "Check",
    links: [
      ["Token risk", "/risk"],
      ["Know Your Agent", "/kya"],
      ["Stats", "/stats"],
    ],
  },
  {
    title: "Developers",
    links: [
      ["Docs", "/docs"],
      ["MCP endpoint", "/docs#mcp"],
      ["x402 manifest", "/.well-known/x402"],
      ["llms.txt", "/llms.txt"],
      ["Stats JSON", "/api/stats/public"],
    ],
  },
  {
    title: "Ecosystem",
    links: [
      ["Argus", "https://argus.world"],
      ["Circle", "https://developers.circle.com"],
      ["x402", "https://x402.org"],
      ["CoinGecko", "https://www.coingecko.com/en/coins/fuci"],
      ["DexScreener", `https://dexscreener.com/arc/${FUCI_TOKEN}`],
      ["Official links & contract", "/official"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg-2">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 grid-cols-2 md:grid-cols-[1.6fr_repeat(4,1fr)]">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-xl font-semibold">Fuci</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted">
            An agentic kelp forest on Arc. Built with Circle Wallets, x402 and USDC.{SHOW_FUCI_TOKEN && " $FUCI is bonded on Argus."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
          <a href={X_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-ink hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            Follow @{X_HANDLE}
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-ink hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" /></svg>
            GitHub
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-ink hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            {CONTACT_EMAIL}
          </a>
          </div>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="eyebrow">{c.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  {href.startsWith("http") ? (
                    <a href={href} target="_blank" rel="noreferrer" className="hover:text-ink">
                      {label} ↗
                    </a>
                  ) : href.startsWith("/api") || href.startsWith("/.well-known") || href.endsWith(".txt") ? (
                    <a href={href} className="hover:text-ink">
                      {label}
                    </a>
                  ) : (
                    <Link href={href} className="hover:text-ink">
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-xs text-muted sm:px-6">
          <p>
            © {new Date().getFullYear()} Fuci · Contact us:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            · Not financial advice: new tokens can go to zero.
          </p>
          {SHOW_FUCI_TOKEN && (
            <p className="flex items-center gap-2 font-mono">
              $FUCI <span className="text-ink-2">{FUCI_TOKEN.slice(0, 6)}…{FUCI_TOKEN.slice(-4)}</span>
              <CopyButton text={FUCI_TOKEN} />
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
