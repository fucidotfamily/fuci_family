import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { C, F, Bubbles, Eyebrow, Frond, Pill, Rings, useIn, useVertical } from "../theme";

const STACK = ["Arc", "USDC", "Circle Gateway", "x402", "ERC-8004", "Argus", "A2A", "MCP"];

/** Built on Arc: the stack, chip by chip. */
export const Stack: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const title = useIn(0);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: vertical ? "0 70px" : "0 160px" }}>
      <div style={{ opacity: title, transform: `translateY(${(1 - title) * 20}px)` }}>
        <Eyebrow>Built natively on Arc</Eyebrow>
      </div>
      <div
        style={{
          marginTop: 26,
          fontFamily: F.display,
          fontWeight: 700,
          fontSize: vertical ? 96 : 100,
          letterSpacing: -3,
          color: C.ink,
          textAlign: "center",
          lineHeight: 1.05,
          opacity: title,
        }}
      >
        Stablecoin-native agents.
      </div>
      <div style={{ marginTop: 56, display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center", maxWidth: vertical ? 900 : 1400 }}>
        {STACK.map((s, i) => {
          const p = spring({ frame: frame - 12 - i * 4, fps, config: { damping: 13 } });
          return (
            <span
              key={s}
              style={{
                padding: "20px 36px",
                borderRadius: 999,
                border: `1.5px solid #333`,
                background: C.surface,
                fontFamily: F.display,
                fontWeight: 600,
                fontSize: 40,
                color: C.ink,
                transform: `scale(${p})`,
                opacity: p,
              }}
            >
              {s}
            </span>
          );
        })}
      </div>
      <div style={{ marginTop: 44, fontFamily: F.body, fontSize: vertical ? 36 : 32, color: C.ink2, opacity: useIn(50) }}>Gas, fees and payments: all in USDC.</div>
    </AbsoluteFill>
  );
};

/** Call to action. */
export const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const vertical = useVertical();
  const a = useIn(24);
  const b = useIn(36);
  const c = useIn(50);
  const pulse = 1 + 0.02 * Math.sin(frame / 8);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Rings x="50%" y="42%" />
      <Bubbles count={18} />
      <div style={{ filter: "drop-shadow(0 0 30px rgba(255,255,255,0.3))" }}>
        <Frond size={vertical ? 230 : 190} delay={0} />
      </div>
      <div
        style={{
          marginTop: 24,
          fontFamily: F.display,
          fontWeight: 700,
          fontSize: vertical ? 130 : 128,
          letterSpacing: -4,
          color: C.ink,
          textAlign: "center",
          lineHeight: 1,
          opacity: a,
          transform: `translateY(${(1 - a) * 30}px)`,
        }}
      >
        Spawn your agent.
      </div>
      <div
        style={{
          marginTop: 46,
          padding: "26px 60px",
          borderRadius: 999,
          background: C.ink,
          color: C.bg,
          fontFamily: F.display,
          fontWeight: 700,
          fontSize: vertical ? 60 : 56,
          opacity: b,
          transform: `scale(${b * pulse})`,
          boxShadow: "0 0 80px rgba(255,255,255,0.25)",
        }}
      >
        fuci.family
      </div>
      <div style={{ marginTop: 44, display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", opacity: c }}>
        <Pill>Free to spawn</Pill>
        <Pill>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: C.up }} />
          Live on Arc mainnet
        </Pill>
        <Pill>@fucidotfamily</Pill>
      </div>
    </AbsoluteFill>
  );
};
