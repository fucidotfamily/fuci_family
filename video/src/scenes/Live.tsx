import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, Bubbles, Eyebrow, Frond, Rings, Typed, useIn, useVertical } from "../theme";

export const FUCI_CA = "0xe66d5169c5d235209d74e976e594060c44c64420";

const CHIPS = ["1% buy · 1% sell", "90% of tax to holders", "3% dev buy"];

/** 5 seconds: "$FUCI is live on Argus", the contract address, the tokenomics. */
export const Live: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const pulse = interpolate(frame, [4, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ticker = spring({ frame: frame - 26, fps, config: { damping: 11, stiffness: 140 } });
  const live = useIn(38);
  const ca = useIn(58);
  const footer = useIn(122);
  const fadeOut = interpolate(frame, [140, 150], [1, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const caText = vertical ? [FUCI_CA.slice(0, 22), FUCI_CA.slice(22)] : [FUCI_CA];

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center", opacity: fadeOut }}>
      <Rings x="50%" y={vertical ? "34%" : "30%"} opacity={pulse} />
      <Bubbles count={16} />
      {/* A green ring that bursts out as the frond finishes. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: vertical ? "34%" : "30%",
          width: 600 * pulse,
          height: 600 * pulse,
          marginLeft: -300 * pulse,
          marginTop: -300 * pulse,
          borderRadius: "50%",
          border: `3px solid rgba(34,197,94,${0.6 * (1 - pulse)})`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: vertical ? -120 : -40 }}>
        <div style={{ filter: "drop-shadow(0 0 30px rgba(255,255,255,0.35))" }}>
          <Frond size={vertical ? 190 : 150} delay={0} />
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: F.display,
            fontWeight: 700,
            fontSize: vertical ? 220 : 190,
            letterSpacing: -6,
            lineHeight: 1,
            color: C.ink,
            transform: `scale(${0.6 + 0.4 * ticker})`,
            opacity: Math.min(1, ticker * 1.5),
            textShadow: "0 0 60px rgba(255,255,255,0.3)",
          }}
        >
          $FUCI
        </div>
        <div style={{ marginTop: 18, opacity: live, transform: `translateY(${(1 - live) * 20}px)` }}>
          <Eyebrow live style={{ fontSize: vertical ? 34 : 30, color: C.ink, letterSpacing: 8 }}>
            is live on Argus
          </Eyebrow>
        </div>

        <div
          style={{
            marginTop: vertical ? 70 : 50,
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: vertical ? "22px 30px" : "18px 28px",
            borderRadius: 18,
            border: `1.5px solid #333`,
            background: C.surface,
            opacity: ca,
            transform: `translateY(${(1 - ca) * 24}px)`,
          }}
        >
          <span style={{ fontFamily: F.mono, fontSize: vertical ? 26 : 22, color: C.bg, background: C.up, borderRadius: 8, padding: "4px 10px", fontWeight: 500 }}>CA</span>
          <span style={{ fontFamily: F.mono, fontSize: vertical ? 38 : 34, color: C.ink, lineHeight: 1.3 }}>
            {caText.map((part, i) => (
              <div key={i}>
                <Typed text={part} start={62 + (i ? Math.ceil((caText[0].length / 60) * fps) : 0)} cps={60} caret={false} />
              </div>
            ))}
          </span>
          <svg width={vertical ? 34 : 30} height={vertical ? 34 : 30} viewBox="0 0 24 24" fill="none" stroke={C.ink2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        </div>

        <div style={{ marginTop: vertical ? 56 : 40, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, maxWidth: vertical ? 900 : 1500 }}>
          {CHIPS.map((c, i) => {
            const s = spring({ frame: frame - 100 - i * 6, fps, config: { damping: 12 } });
            return (
              <span
                key={c}
                style={{
                  padding: vertical ? "14px 26px" : "12px 24px",
                  borderRadius: 999,
                  border: `1.5px solid #333`,
                  background: C.surface2,
                  fontFamily: F.display,
                  fontWeight: 600,
                  fontSize: vertical ? 34 : 30,
                  color: C.ink,
                  transform: `scale(${s})`,
                  opacity: s,
                }}
              >
                {c}
              </span>
            );
          })}
        </div>

        <div style={{ marginTop: vertical ? 60 : 38, fontFamily: F.mono, fontSize: vertical ? 30 : 26, letterSpacing: 4, color: C.ink2, opacity: footer }}>
          argus.world · fuci.family
        </div>
      </div>
    </AbsoluteFill>
  );
};
