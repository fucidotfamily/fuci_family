import type { Metadata } from "next";
import Link from "next/link";
import { AgentDirectory } from "@/components/AgentDirectory";
import { ERC8004 } from "@/lib/erc8004Abi";
import { EXPLORER_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Agents on Arc",
  description: "Every AI agent registered on Arc's ERC-8004 registry, ranked by how ready it is to be hired: x402 payments, a complete profile and on-chain trust.",
};

export default function AgentsPage() {
  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <p className="eyebrow">ERC-8004 directory</p>
        <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Agents on Arc</h1>
        <p className="mt-3 mb-8 max-w-2xl text-ink-2">
          Every AI agent in{" "}
          <a className="underline" href={`${EXPLORER_URL}/address/${ERC8004.identity}`} target="_blank" rel="noreferrer">
            Arc&apos;s agent registry
          </a>
          , live from the chain. Ranked by how ready each one is to be hired.{" "}
          <Link href="/spawn" className="text-ink underline">
            Spawn yours
          </Link>
          .
        </p>
        <AgentDirectory />
      </div>
    </main>
  );
}
