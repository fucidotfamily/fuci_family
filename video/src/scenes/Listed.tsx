import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, Bubbles, Frond, Rings, Typed, useIn, useVertical } from "../theme";

const BLUE = "#3b82f6";
const URL = "defillama.com/protocol/fuci";
const CHIPS = ["Fees tracked", "Revenue tracked", "Treasury: Safe multisig"];

/**
 * 5 s: "Fuci is listed on DefiLlama" (the protocol listing, id 8755, AI Agents on Arc).
 * Timed to public/sting.wav: hit at 26, ticks 62–83, pops 100/106/112, closing chord at 122.
 */
export const Listed: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const head = spring({ frame: frame - 4, fps, config: { damping: 13 } });
  const stamp = spring({ frame: frame - 26, fps, config: { damping: 8, stiffness: 170 } });
  const burst = interpolate(frame, [26, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const card = useIn(38);
  const footer = useIn(122);

  const rows: [string, string][] = [
    ["Protocol", "Fuci"],
    ["Category", "AI Agents"],
    ["Chain", "Arc"],
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center" }}>
      <Rings x="50%" y={vertical ? "30%" : "27%"} opacity={0.9} />
      <Bubbles count={16} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: vertical ? "30%" : "27%",
          width: 900 * burst,
          height: 900 * burst,
          marginLeft: -450 * burst,
          marginTop: -450 * burst,
          borderRadius: "50%",
          border: `4px solid rgba(59,130,246,${0.7 * (1 - burst)})`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: vertical ? -60 : -10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: head, transform: `scale(${0.7 + 0.3 * head})` }}>
          <Frond size={vertical ? 120 : 96} draw={false} />
          <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: vertical ? 160 : 140, letterSpacing: -5, color: C.ink, lineHeight: 1 }}>Fuci</span>
        </div>

        <div
          style={{
            marginTop: 24,
            display: "inline-flex",
            alignItems: "center",
            gap: 16,
            padding: vertical ? "14px 36px" : "12px 34px",
            borderRadius: 999,
            border: `3px solid ${BLUE}`,
            background: "rgba(59,130,246,0.12)",
            color: "#93c5fd",
            fontFamily: F.display,
            fontWeight: 700,
            fontSize: vertical ? 54 : 52,
            letterSpacing: 3,
            transform: `scale(${stamp}) rotate(${(1 - stamp) * -8}deg)`,
            opacity: Math.min(1, stamp * 1.4),
            boxShadow: `0 0 ${60 * stamp}px rgba(59,130,246,0.4)`,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 46, height: 46, borderRadius: 23, background: BLUE, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>✓</span>
          LISTED ON DEFILLAMA
        </div>

        <div
          style={{
            marginTop: vertical ? 50 : 36,
            width: vertical ? 900 : 880,
            borderRadius: 20,
            border: "1.5px solid #1f2b44",
            background: "#0d1526",
            padding: vertical ? "26px 34px" : "22px 32px",
            opacity: card,
            transform: `translateY(${(1 - card) * 30}px)`,
          }}
        >
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #1f2b44", fontFamily: F.body, fontSize: vertical ? 32 : 28 }}>
              <span style={{ color: C.muted }}>{k}</span>
              <span style={{ color: C.ink, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 16, fontFamily: F.mono, fontSize: vertical ? 34 : 32, color: "#93c5fd" }}>
            <Typed text={URL} start={62} cps={36} caret={frame < 90} />
          </div>
        </div>

        <div style={{ marginTop: vertical ? 44 : 32, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, maxWidth: vertical ? 940 : 1500 }}>
          {CHIPS.map((c, i) => {
            const s = spring({ frame: frame - 100 - i * 6, fps, config: { damping: 12 } });
            return (
              <span
                key={c}
                style={{
                  padding: vertical ? "14px 26px" : "12px 24px",
                  borderRadius: 999,
                  border: `1.5px solid ${i < 2 ? "rgba(34,197,94,0.6)" : "#333"}`,
                  background: C.surface2,
                  fontFamily: F.display,
                  fontWeight: 600,
                  fontSize: vertical ? 32 : 28,
                  color: C.ink,
                  transform: `scale(${s})`,
                  opacity: s,
                }}
              >
                {i < 2 ? <span style={{ color: C.up, marginRight: 10 }}>✓</span> : null}
                {c}
              </span>
            );
          })}
        </div>

        <div style={{ marginTop: vertical ? 50 : 34, fontFamily: F.mono, fontSize: vertical ? 28 : 24, letterSpacing: 4, color: C.ink2, opacity: footer, textAlign: "center" }}>
          Every fee on-chain, verifiable
          {vertical ? <br /> : " · "}
          fuci.family
        </div>
      </div>
    </AbsoluteFill>
  );
};
