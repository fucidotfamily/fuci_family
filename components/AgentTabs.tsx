"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useIsOwner } from "./OwnerTools";

export type AgentTab = { id: string; label: string; icon: TabIcon; ownerOnly?: boolean; sub?: string; node: ReactNode };

const PREFIX = "#tab-";
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const readHash = () => (window.location.hash.startsWith(PREFIX) ? window.location.hash.slice(PREFIX.length) : "");

/**
 * The agent page as a menu (left) and one section at a time (right), so nothing needs scrolling past.
 * The open tab lives in the URL hash (#tab-autopilot), so a link can open a section directly.
 */
export function AgentTabs({ owner, tabs, header, footer }: { owner: string; tabs: AgentTab[]; header: ReactNode; footer?: ReactNode }) {
  const mine = useIsOwner(owner);
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const visible = tabs.filter((t) => mine || !t.ownerOnly);
  const active = visible.find((t) => t.id === hash) ?? visible[0];
  const open = (id: string) => {
    // Update the URL without a jump, then tell the hash store the tab changed.
    window.history.pushState(null, "", `${PREFIX}${id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="lg:flex lg:min-h-[calc(100dvh-8rem)] lg:flex-col panel-lg lg:p-3">
          <div className="hidden border-b border-line px-2 pb-3 pt-1 lg:block">{header}</div>
          <nav aria-label="Agent sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:mt-3 lg:overflow-visible lg:px-0">
            <ul className="flex gap-2 lg:flex-col lg:gap-1">
              {visible.map((t) => {
                const on = t.id === active?.id;
                return (
                  <li key={t.id} className="shrink-0">
                    <button
                      type="button"
                      // On phones the tab bar scrolls sideways: keep the open tab in view.
                      ref={on ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
                      onClick={() => open(t.id)}
                      aria-current={on ? "page" : undefined}
                      className={`flex w-full items-center gap-3 whitespace-nowrap rounded-lg border px-2.5 py-2 text-left text-sm transition lg:border-transparent ${
                        on ? "border-ink bg-surface-2 font-semibold text-ink" : "border-line text-ink-2 hover:bg-surface-2/60 hover:text-ink"
                      }`}
                    >
                      <span
                        className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-md lg:flex ${on ? "bg-up text-black" : "bg-surface-2 text-muted"}`}
                        aria-hidden="true"
                      >
                        {TAB_ICONS[t.icon]}
                      </span>
                      {t.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          {footer && <div className="mt-auto hidden pt-4 lg:block">{footer}</div>}
        </div>
      </aside>
      <div className="min-w-0">
        {active && (
          <header className="mb-4">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{active.label}</h2>
            {active.sub && <p className="mt-1 text-sm text-ink-2">{active.sub}</p>}
          </header>
        )}
        {active?.node}
      </div>
    </div>
  );
}

const I = ({ d }: { d: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

/** Small line icons for the menu, picked by name (JSX can't be passed from the server page). */
const TAB_ICONS = {
  overview: <I d={<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h6M7 13h10M7 17h4" /></>} />,
  ask: <I d={<><path d="M4 5h16v11H9l-5 4z" /><path d="M9 10h6" /></>} />,
  autopilot: <I d={<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>} />,
  earn: <I d={<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.7-2.5 2-2.5.9-2.5 2.2 1.1 1.8 2.5 1.8 2.5-.7 2.5-1.8" /></>} />,
  history: <I d={<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>} />,
  identity: <I d={<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M6 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14 10h4M14 13h3" /></>} />,
};

export type TabIcon = keyof typeof TAB_ICONS;
