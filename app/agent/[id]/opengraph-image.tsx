import { ImageResponse } from "next/og";
import { kvGet, resolveAgent } from "@/lib/store";
import { avatarDataUri } from "@/lib/avatar";
import { PUBLIC_DOMAIN } from "@/lib/config";

export const alt = "Fuci agent card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

import { strategyName } from "@/lib/strategy";

/** A Google font as TTF (what ImageResponse can read), limited to the glyphs used. Null if unavailable. */
async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`, {
        signal: AbortSignal.timeout(4_000),
      })
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url, { signal: AbortSignal.timeout(4_000) })).arrayBuffer();
  } catch {
    return null;
  }
}

function Logo() {
  return (
    <svg width="46" height="46" viewBox="0 0 64 64">
      <g fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round">
        <path d="M32 60V38" />
        <path d="M32 38c0-6-8-9-9-17" />
        <path d="M32 38c0-6 8-9 9-17" />
        <path d="M23 21c-1-5-5-7-6-11" />
        <path d="M23 21c1-5 4-7 5-11" />
        <path d="M41 21c-1-5-4-7-5-11" />
        <path d="M41 21c1-5 5-7 6-11" />
      </g>
      <g fill="#ffffff">
        <circle cx="17" cy="9" r="3.2" />
        <circle cx="28" cy="9" r="3.2" />
        <circle cx="36" cy="9" r="3.2" />
        <circle cx="47" cy="9" r="3.2" />
      </g>
    </svg>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = (await resolveAgent(id).catch(() => null))?.agent ?? null;
  const name = a?.name ?? "A Fuci frond";
  const strategy = a ? strategyName(a) : "Agent on Arc";
  const owner = a ? `${a.owner.slice(0, 6)}…${a.owner.slice(-4)}` : "";
  const stats = [
    { label: "Daily limit", value: a ? `${a.dailyLimitUsdc.toFixed(2)} USDC` : "–" },
    { label: "x402 calls", value: a ? a.calls.toLocaleString("en-US") : "0" },
    { label: "Spent", value: a ? `${a.spentUsdc.toFixed(3)} USDC` : "0 USDC" },
    { label: "Sprouted", value: a ? new Date(a.createdAt).toISOString().slice(0, 10) : "–" },
  ];
  const badge = a?.erc8004Id !== undefined ? `ERC-8004 #${a!.erc8004Id}` : "Agent on Arc";
  // Profile image: the owner's upload, else the X avatar, else the generated kelp avatar.
  const uploaded = a?.image ? await kvGet<string>(`agent-image:${a.id}`).catch(() => null) : null;
  const avatar = uploaded ? `data:image/jpeg;base64,${uploaded}` : (a?.x?.avatar ?? avatarDataUri(a?.id ?? id));
  const handle = a?.x ? `@${a.x.username}` : null;
  const nameSize = name.length > 18 ? 72 : name.length > 12 ? 92 : name.length > 8 ? 116 : 140;

  const text = `fuci${name}${strategy}${owner}${stats.map((s) => s.label + s.value).join("")}${badge}${PUBLIC_DOMAIN}${handle ?? ""}FUCI AGENT CARDholdfastPays its own way in USDC over x402…·0123456789.-#`;
  const [display, mono] = await Promise.all([googleFont("Space Grotesk", 700, text), googleFont("JetBrains Mono", 500, text)]);
  const fonts = [
    ...(display ? [{ name: "Display", data: display, weight: 700 as const, style: "normal" as const }] : []),
    ...(mono ? [{ name: "Mono", data: mono, weight: 500 as const, style: "normal" as const }] : []),
  ];
  const displayFont = display ? "Display" : "sans-serif";
  const monoFont = mono ? "Mono" : "monospace";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#000000", color: "#ffffff", overflow: "hidden" }}>
        {/* Tide rings, as on the site's agent card */}
        {Array.from({ length: 12 }, (_, i) => {
          const r = 70 + i * 62;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 930 - r,
                top: 300 - r,
                width: r * 2,
                height: r * 2,
                borderRadius: 9999,
                border: `2px solid rgba(255,255,255,${(0.14 - i * 0.009).toFixed(3)})`,
              }}
            />
          );
        })}
        <div style={{ position: "absolute", left: 918, top: 288, width: 24, height: 24, borderRadius: 9999, background: "#22c55e", boxShadow: "0 0 40px #22c55e" }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: "56px 64px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Logo />
              <span style={{ fontFamily: displayFont, fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>fuci</span>
            </div>
            <div style={{ display: "flex", border: "2px solid #ffffff", borderRadius: 8, padding: "8px 18px", fontFamily: monoFont, fontSize: 22, letterSpacing: 3 }}>
              {badge.toUpperCase()}
            </div>
          </div>

          {/* Avatar + name */}
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            <img src={avatar} width={176} height={176} style={{ borderRadius: 9999, border: "3px solid #ffffff", objectFit: "cover" }} alt="" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: monoFont, fontSize: 22, letterSpacing: 6, color: "#8a8a8a" }}>FUCI AGENT CARD</span>
              <span style={{ fontFamily: displayFont, fontSize: Math.round(nameSize * 0.85), fontWeight: 700, lineHeight: 1, letterSpacing: -3, marginTop: 12, maxWidth: 620 }}>{name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 12 }}>
                <span style={{ fontSize: 32, color: "#b3b3b3" }}>{strategy}</span>
                {handle && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, border: "2px solid #444", borderRadius: 8, padding: "4px 12px" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24">
                      <path fill="#ffffff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    <span style={{ fontFamily: monoFont, fontSize: 24 }}>{handle}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 56 }}>
              {stats.map((s) => (
                <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 22, color: "#8a8a8a" }}>{s.label}</span>
                  <span style={{ fontFamily: monoFont, fontSize: 32, marginTop: 6 }}>{s.value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 30, paddingTop: 22, borderTop: "2px solid #2a2a2a" }}>
              <span style={{ fontFamily: monoFont, fontSize: 22, color: "#8a8a8a" }}>{owner ? `holdfast · ${owner}` : "Pays its own way in USDC over x402"}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: 9999, background: "#22c55e" }} />
                <span style={{ fontFamily: displayFont, fontSize: 32, fontWeight: 700 }}>{PUBLIC_DOMAIN}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
