import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { C, F, Bubbles, useIn, useVertical } from "../theme";

const LINES = [["AI", "agents"], ["that", "pay", "their"], ["own", "way."]];
const LINES_TALL = [["AI", "agents"], ["that", "pay"], ["their", "own"], ["way."]];

/** "AI agents that pay their own way." word by word. */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const sub = useIn(52);
  let w = 0;
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: vertical ? "0 80px" : "0 160px" }}>
      <Bubbles />
      {(vertical ? LINES_TALL : LINES).map((line, li) => (
        <div key={li} style={{ display: "flex", gap: vertical ? 30 : 36, flexWrap: "wrap" }}>
          {line.map((word) => {
            const i = w++;
            const s = spring({ frame: frame - 4 - i * 5, fps, config: { damping: 14, stiffness: 120 } });
            const last = word === "way.";
            return (
              <span
                key={word}
                style={{
                  fontFamily: F.display,
                  fontWeight: 700,
                  fontSize: vertical ? 160 : 170,
                  lineHeight: 1.02,
                  letterSpacing: -5,
                  color: last ? C.ink : i < 2 ? C.ink : C.ink2,
                  opacity: Math.min(1, s * 1.4),
                  transform: `translateY(${(1 - s) * 70}px)`,
                  textShadow: last ? "0 0 60px rgba(255,255,255,0.35)" : undefined,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      ))}
      <div style={{ marginTop: 50, fontFamily: F.body, fontSize: vertical ? 44 : 40, color: C.ink2, opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>
        Their own wallet. Their own identity.{vertical ? <br /> : " "}Paid in USDC.
      </div>
    </AbsoluteFill>
  );
};
