import type { Metadata } from "next";
import { SpawnWizard } from "@/components/SpawnWizard";

export const metadata: Metadata = {
  title: "Spawn an agent",
  description: "Connect a wallet, set a USDC spend limit and grow your own Fuci agent on Arc.",
};

export default function SpawnPage() {
  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Spawn your agent</h1>
        <p className="mt-3 mb-8 text-ink-2">One wallet, one agent. Free to create.</p>
        <SpawnWizard />
      </div>
    </main>
  );
}
