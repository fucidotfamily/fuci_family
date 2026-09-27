"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type NavLink = { href: string; label: string };

/** The site links on phones and tablets: a menu button that opens a panel under the header (below lg, where the inline links are hidden). */
export function MobileMenu({ links, xUrl, xHandle, githubUrl }: { links: NavLink[]; xUrl: string; xHandle: string; githubUrl: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="btn btn-ghost !px-2.5 !py-2"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-line bg-bg shadow-lg">
          <ul className="mx-auto max-w-6xl divide-y divide-line/60 px-4 py-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={close} className="block py-3 text-base text-ink-2 hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="flex gap-4 py-3 text-sm text-ink-2">
              <a href={xUrl} target="_blank" rel="noreferrer" onClick={close} className="hover:text-ink">
                X @{xHandle} ↗
              </a>
              <a href={githubUrl} target="_blank" rel="noreferrer" onClick={close} className="hover:text-ink">
                GitHub ↗
              </a>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
