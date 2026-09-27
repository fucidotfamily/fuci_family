import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Frond, useVertical } from "../theme";

/** Frame timings, shared with scripts/passport.py so the sound lands on the picture. */
export const T = {
  open: 6, // the passport slides in and opens
  fields: 40, // + i * 14, typed in
  stamps: [150, 176, 202] as const,
  score: 232,
  close: 290,
};

/** Fuci agent #196 on Arc Mainnet, read from the ERC-8004 registries when this clip was made. */
const FIELDS: [string, string][] = [
  ["AGENT ID", "#196"],
  ["NAME", "Fuci"],
  ["REGISTRY", "ERC-8004 · Arc Mainnet"],
  ["WALLET", "USDC · its own"],
  ["PAYS WITH", "x402 · per call"],
  ["OWNER", "0x900c…160A"],
];
const STAMPS: { text: string; sub: string; color: string; rot: number }[] = [
  { text: "ON-CHAIN", sub: "IDENTITY REGISTRY", color: "#22c55e", rot: -12 },
  { text: "14 PAID", sub: "x402 CALLS · USDC", color: "#38bdf8", rot: 8 },
  { text: "RATED", sub: "BY 4 WALLETS", color: "#f59e0b", rot: -5 },
];

const PAPER = "#f3eee2";
const INK = "#1c2a24";
const COVER = "#0f3d2a";

const Stamp: React.FC<{ at: number; text: string; sub: string; color: string; rot: number; size: number }> = ({ at, text, sub, color, rot, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at - 4) return null;
  // Comes down from above and lands hard.
  const drop = interpolate(frame, [at - 4, at], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const land = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 300 } });
  return (
    <div
      style={{
        transform: `rotate(${rot}deg) scale(${1 + drop * 0.9 - (1 - Math.min(1, land)) * 0.05})`,
        opacity: frame < at ? 0.35 : 0.92,
        border: `${size * 0.06}px solid ${color}`,
        borderRadius: size * 0.12,
        padding: `${size * 0.1}px ${size * 0.22}px`,
        color,
        fontFamily: F.display,
        fontWeight: 700,
        textAlign: "center",
        lineHeight: 1,
        mixBlendMode: "multiply",
      }}
    >
      <div style={{ fontSize: size * 0.42, letterSpacing: 2 }}>{text}</div>
      <div style={{ marginTop: size * 0.08, fontFamily: F.mono, fontSize: size * 0.16, letterSpacing: 3 }}>{sub}</div>
    </div>
  );
};

/**
 * 11 s: "Agent passport". Fuci agent #196's ERC-8004 identity as a passport page: fields type in,
 * three stamps land (on-chain, 14 paid calls, rated by 4 wallets), then a 100/100 score and the CTA.
 * Sound: public/passport.wav from scripts/passport.py.
 */
export const Passport: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const v = useVertical();

  const slide = spring({ frame: frame - T.open, fps, config: { damping: 16 } });
  const openCover = interpolate(frame, [T.open + 14, T.open + 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - (1 - t) ** 3 });
  const score = spring({ frame: frame - T.score, fps, config: { damping: 11 } });
  const shake = [...T.stamps].reduce((s, at) => s + (frame >= at && frame < at + 6 ? Math.sin((frame - at) * 4) * (6 - (frame - at)) * 1.6 : 0), 0);
  const out = interpolate(frame, [T.close - 8, T.close + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cta = spring({ frame: frame - T.close, fps, config: { damping: 15 } });

  const pageW = v ? 900 : 1180;
  const pageH = v ? 1180 : 700;
  const typeLen = (i: number) => {
    const [, val] = FIELDS[i];
    return Math.max(0, Math.min(val.length, Math.floor((frame - (T.fields + i * 14)) * 1.2)));
  };

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #16261e 0%, #0a100d 60%, #050706 100%)", overflow: "hidden" }}>
      {/* Desk texture */}
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0 2px, transparent 2px 9px)" }} />

      {/* The passport */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
        <div style={{ position: "relative", width: pageW, height: pageH, transform: `translate(${shake}px, ${(1 - slide) * 700}px) rotate(${(1 - slide) * -6}deg)` }}>
          {/* Page */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 26,
              background: `repeating-linear-gradient(135deg, ${PAPER} 0 14px, #ece6d7 14px 15px)`,
              boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
              padding: v ? "60px 56px" : "48px 60px",
              color: INK,
              display: "flex",
              flexDirection: v ? "column" : "row",
              gap: v ? 40 : 56,
            }}
          >
            {/* Photo */}
            <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ width: v ? 260 : 250, height: v ? 300 : 300, borderRadius: 16, background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", border: `4px solid ${INK}` }}>
                <Frond size={v ? 170 : 160} draw={false} />
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: 4 }}>AGENT PASSPORT</div>
            </div>
            {/* Fields */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: 5, color: "#5b6b62" }}>ARC · ERC-8004 · IDENTITY</div>
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: v ? "1fr" : "1fr 1fr", gap: v ? "18px 0" : "22px 36px" }}>
                {FIELDS.map(([k, val], i) => (
                  <div key={k} style={{ borderBottom: "2px dashed #b9b19d", paddingBottom: 8 }}>
                    <div style={{ fontFamily: F.mono, fontSize: 16, letterSpacing: 3, color: "#6b7a70" }}>{k}</div>
                    <div style={{ marginTop: 4, fontFamily: F.mono, fontSize: v ? 40 : 36, fontWeight: 500, minHeight: 44 }}>
                      {val.slice(0, typeLen(i))}
                      {typeLen(i) > 0 && typeLen(i) < val.length ? "▍" : ""}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, fontFamily: F.mono, fontSize: 18, letterSpacing: 2, color: "#8a927f", whiteSpace: "nowrap", overflow: "hidden" }}>
                {"P<ARC<FUCI<<AGENT<196<<ERC8004<X402<USDC<<<<<<<<<<<<<<<<"}
              </div>
            </div>
          </div>

          {/* Stamps */}
          <div style={{ position: "absolute", left: v ? 60 : 380, right: v ? 60 : 40, bottom: v ? 90 : 60, display: "flex", justifyContent: "space-around", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
            {STAMPS.map((s, i) => (
              <Stamp key={s.text} at={T.stamps[i]} {...s} size={v ? 120 : 110} />
            ))}
          </div>

          {/* Score seal */}
          {frame >= T.score && (
            <div
              style={{
                position: "absolute",
                right: v ? 40 : -60,
                top: v ? 330 : -70,
                width: v ? 250 : 240,
                height: v ? 250 : 240,
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 30%, #4ade80, #15803d)",
                boxShadow: "0 20px 60px rgba(34,197,94,0.45)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                transform: `scale(${score}) rotate(${(1 - score) * 40}deg)`,
              }}
            >
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 96 : 92, lineHeight: 1 }}>100</div>
              <div style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: 3, marginTop: 6 }}>REPUTATION</div>
            </div>
          )}

          {/* Cover opening away */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 26,
              background: `linear-gradient(135deg, ${COVER}, #082017)`,
              transformOrigin: v ? "top center" : "left center",
              transform: v ? `perspective(2200px) rotateX(${openCover * 110}deg)` : `perspective(2200px) rotateY(${-openCover * 110}deg)`,
              opacity: openCover > 0.98 ? 0 : 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 26,
              color: "#d9c98f",
              boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
              backfaceVisibility: "hidden",
            }}
          >
            <Frond size={v ? 200 : 160} draw={false} />
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 66 : 56, letterSpacing: 10 }}>AGENT PASSPORT</div>
            <div style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: 8 }}>ARC MAINNET</div>
          </div>
        </div>
      </AbsoluteFill>

      {/* CTA */}
      {frame >= T.close && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 28 : 22, opacity: cta, transform: `translateY(${(1 - cta) * 30}px)`, padding: "0 40px", textAlign: "center" }}>
            <Frond size={v ? 110 : 96} draw={false} />
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 96 : 100, letterSpacing: -3, color: "#fff", lineHeight: 1.05 }}>
              Every agent gets
              <br />a <span style={{ color: "#4ade80" }}>passport</span>.
            </div>
            <div style={{ fontFamily: F.body, fontSize: v ? 38 : 36, color: "#d4d4d4" }}>On-chain identity on Arc for $1.</div>
            <div style={{ fontFamily: F.mono, fontSize: v ? 36 : 34, color: "#4ade80", letterSpacing: 2 }}>fuci.family/spawn</div>
          </div>
        </AbsoluteFill>
      )}
      {width < 0 && null}
    </AbsoluteFill>
  );
};
