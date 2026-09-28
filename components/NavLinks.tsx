"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavMenu } from "./NavMenu";

export type NavItem = { href: string; label: string } | { label: string; items: { href: string; label: string; hint: string }[] };

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The main links (desktop): the current page in bold white, the rest grey. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname() ?? "/";
  return (
    <ul className="hidden items-center gap-7 text-sm text-ink-2 lg:flex">
      {items.map((l) => {
        const on = "items" in l ? l.items.some((i) => isActive(path, i.href)) : isActive(path, l.href);
        return (
          <li key={l.label} className={on ? "font-semibold text-ink" : undefined}>
            {"items" in l ? (
              <NavMenu label={l.label} items={l.items} />
            ) : (
              <Link href={l.href} aria-current={on ? "page" : undefined} className="hover:text-ink">
                {l.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
