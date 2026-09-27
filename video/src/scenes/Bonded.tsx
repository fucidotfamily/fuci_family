import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, Bubbles, Eyebrow, Frond, Rings, useIn, useVertical } from "../theme";

/** Numbers from the Argus token page at the time of the clip. */
const STATS = [
  { value: 148, fmt: (n: number) => `${Math.round(n)}`, label: "holders" },
  { value: 95, fmt: (n: number) => `$${Math.round(n)}K`, label: "24h volume" },
  { value: 1.2, fmt: (n: number) => `$${n.toFixed(1)}K`, label: "paid to holders in USDC" },
];

/**
 * 5 s: "$FUCI bonded". Timed to public/sting.wav (hit at frame 26, ticks 62–83, pops 100/106/112,
 * closing chord at 122) so the sound lines up without a new track.
 */
export const Bonded: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const ticker = spring({ frame: frame - 6, fps, config: { damping: 12 } });
  const stamp = spring({ frame: frame - 26, fps, config: { damping: 8, stiffness: 170 } });
  const burst = interpolate(frame, [26, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sub = useIn(38);
  const count = interpolate(frame, [62, 84], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - (1 - t) ** 3 });
  const footer = useIn(122);
  const bar = interpolate(frame, [30, 56], [0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center" }}>
      <Rings x="50%" y={vertical ? "32%" : "30%"} opacity={0.9} />
      <Bubbles count={18} />
      {/* Golden burst when it bonds. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: vertical ? "32%" : "30%",
          width: 900 * burst,
          height: 900 * burst,
          marginLeft: -450 * burst,
          marginTop: -450 * burst,
          borderRadius: "50%",
          border: `4px solid rgba(245,197,66,${0.7 * (1 - burst)})`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: vertical ? -80 : -20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, opacity: ticker, transform: `scale(${0.7 + 0.3 * ticker})` }}>
          <Frond size={vertical ? 120 : 100} draw={false} />
          <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: vertical ? 170 : 150, letterSpacing: -5, color: C.ink, lineHeight: 1 }}>$FUCI</span>
        </div>

        <div
          style={{
            marginTop: 26,
            padding: vertical ? "14px 44px" : "12px 40px",
            borderRadius: 999,
            border: "3px solid #f5c542",
            background: "rgba(245,197,66,0.12)",
            color: "#f5c542",
            fontFamily: F.display,
            fontWeight: 700,
            fontSize: vertical ? 84 : 76,
            letterSpacing: 6,
            transform: `scale(${stamp}) rotate(${(1 - stamp) * -8}deg)`,
            opacity: Math.min(1, stamp * 1.4),
            boxShadow: `0 0 ${60 * stamp}px rgba(245,197,66,0.35)`,
          }}
        >
          🏆 BONDED
        </div>

        <div style={{ marginTop: 24, width: vertical ? 760 : 820, opacity: sub }}>
          <div style={{ height: 14, borderRadius: 7, background: "#222", overflow: "hidden" }}>
            <div style={{ width: `${bar * 100}%`, height: "100%", background: "linear-gradient(90deg,#f5c542,#ffd86b)" }} />
          </div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
            <Eyebrow style={{ fontSize: vertical ? 24 : 22 }}>in under 24 hours on Argus</Eyebrow>
            <span style={{ fontFamily: F.mono, fontSize: vertical ? 24 : 22, color: "#f5c542" }}>{Math.round(bar * 100)}%</span>
          </div>
        </div>

        <div style={{ marginTop: vertical ? 70 : 50, display: "flex", flexDirection: vertical ? "column" : "row", gap: vertical ? 22 : 24 }}>
          {STATS.map((s, i) => {
            const pop = spring({ frame: frame - 100 - i * 6, fps, config: { damping: 12 } });
            const shown = Math.max(count, pop > 0.05 ? 1 : 0);
            return (
              <div
                key={s.label}
                style={{
                  minWidth: vertical ? 700 : 300,
                  padding: vertical ? "22px 34px" : "22px 30px",
                  borderRadius: 20,
                  border: `1.5px solid ${i === 2 ? C.up : "#333"}`,
                  background: C.surface,
                  textAlign: "center",
                  opacity: Math.min(1, count * 1.5),
                  transform: `scale(${0.9 + 0.1 * Math.max(count, 0) + 0.06 * Math.sin(Math.PI * Math.min(1, pop))})`,
                  boxShadow: i === 2 ? `0 0 ${30 * pop}px rgba(34,197,94,0.35)` : undefined,
                }}
              >
                <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: vertical ? 72 : 64, color: i === 2 ? C.up : C.ink, lineHeight: 1.05 }}>{s.fmt(s.value * shown)}</div>
                <div style={{ marginTop: 6, fontFamily: F.body, fontSize: vertical ? 28 : 24, color: C.ink2 }}>{s.label}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: vertical ? 60 : 40, fontFamily: F.mono, fontSize: vertical ? 28 : 24, letterSpacing: 4, color: C.ink2, opacity: footer, textAlign: "center" }}>
          90% of every tax → holders
          {vertical ? <br /> : " · "}
          argus.world · fuci.family
        </div>
      </div>
    </AbsoluteFill>
  );
};
