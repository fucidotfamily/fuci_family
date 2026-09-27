import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { C, F, Caption, Frond, Split, useVertical } from "../theme";

const NODES = [
  { label: "A2A", sub: "agent-to-agent" },
  { label: "MCP", sub: "tools for any AI" },
  { label: "x402", sub: "pay per call" },
  { label: "ERC-8004", sub: "identity" },
  { label: "Reputation", sub: "on-chain trust" },
  { label: "Other agents", sub: "on Arc" },
];

/** 04 · Network: every Fuci agent is discoverable and callable by other agents. */
export const Network: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const S = vertical ? 900 : 860;
  const R = S * 0.37;
  const c = S / 2;
  const hub = spring({ frame: frame - 6, fps, config: { damping: 12 } });
  return (
    <Split caption={<Caption n="04 · Connect" title="Found and hired by other agents." sub="Each agent gets an on-chain ID on Arc, an A2A endpoint and paid tools that any other agent can call." />}>
      <div style={{ position: "relative", width: S, height: S }}>
        <svg width={S} height={S} style={{ position: "absolute", inset: 0 }}>
          {NODES.map((n, i) => {
            const a = (i / NODES.length) * Math.PI * 2 - Math.PI / 2;
            const x = c + Math.cos(a) * R;
            const y = c + Math.sin(a) * R;
            const p = interpolate(frame, [20 + i * 8, 40 + i * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            // A payment pulse travelling along each link.
            const t = ((frame - 50 - i * 11) % 60) / 60;
            const show = frame > 50 + i * 11;
            return (
              <g key={n.label}>
                <line x1={c} y1={c} x2={c + (x - c) * p} y2={c + (y - c) * p} stroke="#3a3a3a" strokeWidth={2} strokeDasharray="6 8" />
                {show && <circle cx={c + (x - c) * t} cy={c + (y - c) * t} r={6} fill={C.up} opacity={1 - t * 0.6} />}
              </g>
            );
          })}
        </svg>
        <div
          style={{
            position: "absolute",
            left: c - 110,
            top: c - 110,
            width: 220,
            height: 220,
            borderRadius: 110,
            background: C.surface,
            border: `2px solid #3a3a3a`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${hub})`,
            boxShadow: `0 0 ${60 + 20 * Math.sin(frame / 10)}px rgba(255,255,255,0.15)`,
          }}
        >
          <Frond size={130} draw={false} />
        </div>
        {NODES.map((n, i) => {
          const a = (i / NODES.length) * Math.PI * 2 - Math.PI / 2;
          const x = c + Math.cos(a) * R;
          const y = c + Math.sin(a) * R;
          const s = spring({ frame: frame - 34 - i * 8, fps, config: { damping: 14 } });
          return (
            <div
              key={n.label}
              style={{
                position: "absolute",
                left: x - 115,
                top: y - 52,
                width: 230,
                padding: "16px 0",
                borderRadius: 18,
                background: C.surface2,
                border: `1.5px solid ${C.line}`,
                textAlign: "center",
                transform: `scale(${s})`,
              }}
            >
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 31, color: C.ink }}>{n.label}</div>
              <div style={{ fontFamily: F.mono, fontSize: 17, color: C.muted, marginTop: 4 }}>{n.sub}</div>
            </div>
          );
        })}
      </div>
    </Split>
  );
};
