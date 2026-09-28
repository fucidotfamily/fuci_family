import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveAgent } from "@/lib/store";
import { pnlOf } from "@/lib/tradePnl";
import { requestOrigin } from "@/lib/requestOrigin";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const sign = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(2)}`;
/** Changes every 10 minutes, so X fetches a fresh card when a newer PnL is shared. */
const bucket = () => Math.floor(Date.now() / 600_000);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { agent } = await resolveAgent(id);
  if (!agent) return { title: "Agent not found" };
  const origin = await requestOrigin();
  const p = await pnlOf(agent.id).catch(() => null);
  const title = p ? `${agent.name}: ${sign(p.pnlUsdc)} USDC on autopilot` : `${agent.name} on autopilot`;
  const image = `${origin}/api/agent/${agent.id}/pnl-card?v=${bucket()}`;
  return {
    metadataBase: new URL(origin),
    title,
    description: `${agent.name} trades Argus tokens on Arc by itself with Fuci's autopilot. See its PnL and spawn your own agent.`,
    alternates: { canonical: `${origin}/agent/${agent.id}/pnl` },
    openGraph: { title, url: `${origin}/agent/${agent.id}/pnl`, siteName: "Fuci", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function PnlPage({ params }: Props) {
  const { id } = await params;
  const { agent } = await resolveAgent(id);
  if (!agent) notFound();
  const p = await pnlOf(agent.id);
  const up = p.pnlUsdc >= 0;
  const card = `/api/agent/${agent.id}/pnl-card?v=${bucket()}`;
  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="eyebrow">
          <Link href={`/agent/${agent.id}`} className="hover:text-ink">
            {agent.name}
          </Link>{" "}
          · Autopilot PnL
        </p>
        <h1 className={`font-display mt-3 text-5xl font-semibold tracking-tight ${up ? "text-up" : "text-danger"}`}>
          {sign(p.pnlUsdc)} USDC
          {p.pnlPct !== null && <span className="ml-3 font-mono text-2xl">{`${p.pnlPct >= 0 ? "+" : "−"}${Math.abs(p.pnlPct).toFixed(1)}%`}</span>}
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          {p.buys + p.sells} trades · bought {p.boughtUsdc.toFixed(2)} USDC · sold {p.soldUsdc.toFixed(2)} · still holding {p.openValueUsdc.toFixed(2)}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- the generated card itself, as shared on X */}
        <img src={card} alt={`${agent.name} autopilot PnL card`} width={1200} height={630} className="mt-6 w-full rounded-md border border-line" />
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={card} download={`${agent.id}-pnl.png`} className="btn btn-ghost">
            Download image
          </a>
          <Link href="/spawn" className="btn btn-primary">
            Spawn your own agent
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted">
          PnL = USDC received from sells + current value of open positions − USDC spent on buys (fees included), read from the agent&apos;s trades on Arc. Not financial advice.
        </p>
      </div>
    </main>
  );
}
