"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          // clipboard blocked; nothing to do
        }
      }}
      className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-2 hover:border-ink hover:text-ink"
    >
      {done ? "Copied" : label}
    </button>
  );
}
