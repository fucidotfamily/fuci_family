import type { Metadata } from "next";
import { Capabilities } from "@/components/Capabilities";
import { escrowAddress } from "@/lib/escrow";

export const metadata: Metadata = {
  title: { absolute: "Tools: what a Fuci agent can do · Fuci" },
  description:
    "Launch Scout, Bonding Watcher, Tide Oracle, token risk, Know Your Agent, trading autopilot, escrow and the Market: every Fuci tool, priced per call in USDC over x402.",
};

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const escrow = await escrowAddress().catch(() => null);
  return (
    <main className="depth min-h-dvh">
      <Capabilities escrowLive={Boolean(escrow)} page />
    </main>
  );
}
