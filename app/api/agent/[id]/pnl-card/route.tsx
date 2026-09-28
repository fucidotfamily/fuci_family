import { ImageResponse } from "next/og";
import { resolveAgent } from "@/lib/store";
import { pnlOf } from "@/lib/tradePnl";
import { googleFont } from "@/lib/ogFont";
import { PUBLIC_DOMAIN } from "@/lib/config";

export const dynamic = "force-dynamic";

const usd = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(2)}`;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The agent's trading PnL as a 1200×630 card, for sharing on X (the /agent/[id]/pnl page uses it as its preview). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { agent } = await resolveAgent((await params).id);
  if (!agent) return new Response("Agent not found", { status: 404 });
  const p = await pnlOf(agent.id);
  const up = p.pnlUsdc >= 0;
  const color = up ? "#22c55e" : "#ef4444";
  const big = `${usd(p.pnlUsdc)} USDC`;
  const pct = p.pnlPct === null ? "" : `${p.pnlPct >= 0 ? "+" : "−"}${Math.abs(p.pnlPct).toFixed(1)}%`;
  const text = `${agent.name}${big}${pct}AUTOPILOT PNL ON FUCI trades bought sold open since fuci.family 0123456789.,+−%$`;
  const [display, mono] = await Promise.all([googleFont("Space Grotesk", 700, text), googleFont("JetBrains Mono", 500, text)]);
  const fonts = [
    ...(display ? [{ name: "Display", data: display, weight: 700 as const }] : []),
    ...(mono ? [{ name: "Mono", data: mono, weight: 500 as const }] : []),
  ];
  const stat = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", padding: "18px 26px", border: "1px solid #262626", borderRadius: 16, background: "#0c0c0c", minWidth: 200 }}>
      <div style={{ fontFamily: "Mono", fontSize: 20, letterSpacing: 3, color: "#7a7a7a" }}>{label}</div>
      <div style={{ fontFamily: "Display", fontSize: 38, color: "#fff", marginTop: 6 }}>{value}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 72px", background: `linear-gradient(120deg, #000 40%, ${up ? "#0d3a1f" : "#3a0f0f"} 100%)`, color: "#fff", fontFamily: "Display" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 40 }}>
            <svg width="44" height="44" viewBox="0 0 64 64">
              <g fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round">
                <path d="M32 60V38" /><path d="M32 38c0-6-8-9-9-17" /><path d="M32 38c0-6 8-9 9-17" /><path d="M23 21c-1-5-5-7-6-11" /><path d="M23 21c1-5 4-7 5-11" /><path d="M41 21c-1-5-4-7-5-11" /><path d="M41 21c1-5 5-7 6-11" />
              </g>
            </svg>
            fuci
          </div>
          <div style={{ fontFamily: "Mono", fontSize: 22, letterSpacing: 4, color: "#b3b3b3" }}>AUTOPILOT PNL</div>
        </div>
        <div style={{ marginTop: 50, fontSize: 44, color: "#b3b3b3" }}>{agent.name.slice(0, 32)}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 6 }}>
          <div style={{ fontSize: 132, color, letterSpacing: -4, lineHeight: 1 }}>{big}</div>
          {pct && <div style={{ fontFamily: "Mono", fontSize: 48, color }}>{pct}</div>}
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: "auto" }}>
          {stat("TRADES", String(p.buys + p.sells))}
          {stat("BOUGHT", `${p.boughtUsdc.toFixed(2)}`)}
          {stat("SOLD + OPEN", `${(p.soldUsdc + p.openValueUsdc).toFixed(2)}`)}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", marginLeft: "auto", alignItems: "flex-end" }}>
            <div style={{ fontFamily: "Mono", fontSize: 20, color: "#7a7a7a" }}>{p.since ? `since ${day(p.since)}` : ""}</div>
            <div style={{ fontFamily: "Mono", fontSize: 28, color: "#fff", marginTop: 6 }}>{PUBLIC_DOMAIN}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
