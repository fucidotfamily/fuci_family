import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F, Frond, Eyebrow, Rings, useIn, useVertical } from "../theme";

/** The frond draws itself, then the name and "Live on Arc". */
export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const vertical = useVertical();
  const name = useIn(44);
  const live = useIn(58);
  const glow = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Rings x="50%" y="45%" opacity={glow} />
      <div style={{ filter: `drop-shadow(0 0 ${30 * glow}px rgba(255,255,255,0.35))` }}>
        <Frond size={vertical ? 300 : 260} delay={4} />
      </div>
      <div
        style={{
          marginTop: 24,
          fontFamily: F.display,
          fontWeight: 700,
          fontSize: vertical ? 150 : 130,
          letterSpacing: -4,
          color: C.ink,
          opacity: name,
          transform: `translateY(${(1 - name) * 30}px)`,
        }}
      >
        Fuci
      </div>
      <div style={{ marginTop: 18, opacity: live }}>
        <Eyebrow live>Live on Arc mainnet</Eyebrow>
      </div>
    </AbsoluteFill>
  );
};
