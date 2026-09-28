import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { GITHUB_URL, SHOW_FUCI_TOKEN, X_HANDLE, X_URL } from "@/lib/config";
import { MyAgentButton } from "./MyAgentButton";
import { MobileMenu } from "./MobileMenu";
import { NavLinks, type NavItem } from "./NavLinks";
import { FuciChip } from "./FuciChip";

const NAV: NavItem[] = [
  { href: "/market", label: "Market" },
  {
    label: "Agents",
    items: [
      { href: "/agents", label: "Agent directory", hint: "Every ERC-8004 agent on Arc, ranked" },
      { href: "/tools", label: "What agents can do", hint: "Strategies, autopilot and every paid tool" },
      { href: "/escrow", label: "Hire with escrow", hint: "Lock USDC; the agent is paid when the job is done" },
    ],
  },
  {
    label: "Check",
    items: [
      { href: "/risk", label: "Token risk", hint: "A–F grade for any Arc token or DeFi protocol" },
      { href: "/kya", label: "Know Your Agent", hint: "Trust grade for any AI agent before you pay it" },
    ],
  },
  { href: "/stats", label: "Stats" },
];

/** Phones get every link flat. */
const LINKS = [
  ...NAV.flatMap((n) => ("items" in n ? n.items.map(({ href, label }) => ({ href, label })) : [n])),
  ...(SHOW_FUCI_TOKEN ? [{ href: "/#fuci", label: "$FUCI" }] : []),
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Fuci home">
          <Logo />
          <span className="font-display text-xl font-bold tracking-tight">fuci</span>
        </Link>
        <NavLinks items={NAV} />
        <div className="flex items-center gap-2">
          {SHOW_FUCI_TOKEN && <FuciChip />}
          {/* On phones these live in the menu, so the header fits a 320px screen. */}
          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/docs" aria-label="Docs" title="Docs" className="btn btn-ghost !px-2.5 !py-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5Z" /><path d="M4 19.5A2 2 0 0 0 6 22h13v-3" /></svg>
            </Link>
            <a href={X_URL} target="_blank" rel="noreferrer" aria-label={`Fuci on X (@${X_HANDLE})`} title={`@${X_HANDLE}`} className="btn btn-ghost !px-2.5 !py-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
          </div>
          <ThemeToggle />
          <div className="ml-2">
            <MyAgentButton />
          </div>
          <MobileMenu links={LINKS} xUrl={X_URL} xHandle={X_HANDLE} githubUrl={GITHUB_URL} />
        </div>
      </nav>
    </header>
  );
}
