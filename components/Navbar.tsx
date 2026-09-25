import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { GITHUB_URL, SHOW_FUCI_TOKEN, X_HANDLE, X_URL } from "@/lib/config";
import { MyAgentButton } from "./MyAgentButton";

const LINKS = [
  { href: "/#tools", label: "Tools" },
  { href: "/agents", label: "Agents" },
  ...(SHOW_FUCI_TOKEN ? [{ href: "/#fuci", label: "$FUCI" }] : []),
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Fuci home">
          <Logo />
          <span className="font-display text-xl font-bold tracking-tight">fuci</span>
        </Link>
        <ul className="hidden items-center gap-6 text-sm text-ink-2 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="hover:text-ink">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <a href={X_URL} target="_blank" rel="noreferrer" aria-label={`Fuci on X (@${X_HANDLE})`} title={`@${X_HANDLE}`} className="btn btn-ghost hidden !px-2.5 !py-2 sm:inline-flex">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Fuci on GitHub" title="github.com/fucidotfamily" className="btn btn-ghost hidden !px-2.5 !py-2 sm:inline-flex">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" /></svg>
          </a>
          <ThemeToggle />
          <MyAgentButton />
        </div>
      </nav>
    </header>
  );
}
