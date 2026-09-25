import type { Metadata } from "next";
import { SetupPanel } from "@/components/SetupPanel";

export const metadata: Metadata = {
  title: "Setup",
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Turn on Fuci on Arc</h1>
        <p className="mt-4 mb-8 text-ink-2">
          Two variables in Vercel are enough: your wallet address and an agent key generated here. Payments run on Circle Gateway, which needs
          no Circle account.
        </p>
        <SetupPanel />
      </div>
    </main>
  );
}
