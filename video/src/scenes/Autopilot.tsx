import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, F, Caption, Pill, Split, Window, useIn, useVertical } from "../theme";

const RULES: { label: string; value: string }[] = [
  { label: "Buy every new Argus launch", value: "1 USDC · tax ≤ 5%" },
  { label: "Buy when a token bonds", value: "spend 2 USDC" },
  { label: "Take profit", value: "+100% → sell 50%" },
  { label: "Stop loss", value: "−50% → sell all" },
  { label: "Sell when the dev sells", value: "exit" },
  { label: "Limit buy / limit sell", value: "your price" },
];

const Toggle: React.FC<{ on: number }> = ({ on }) => (
  <div style={{ position: "relative", width: 64, height: 36, borderRadius: 18, background: on > 0.5 ? C.up : "#2a2a2a", transition: "none" }}>
    <div style={{ position: "absolute", top: 4, left: 4 + on * 28, width: 28, height: 28, borderRadius: 14, background: C.ink }} />
  </div>
);

const Rule: React.FC<{ label: string; value: string; at: number }> = ({ label, value, at }) => {
  const frame = useCurrentFrame();
  const show = useIn(at - 10);
  const on = interpolate(frame, [at, at + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "14px 0", borderTop: `1.5px solid ${C.line}`, opacity: show }}>
      <Toggle on={on} />
      <span style={{ flex: 1, fontFamily: F.body, fontSize: 26, color: on > 0.5 ? C.ink : C.ink2 }}>{label}</span>
      <span style={{ fontFamily: F.mono, fontSize: 20, color: C.muted }}>{value}</span>
    </div>
  );
};

/** A tiny live chart with buy and sell markers. */
const Chart: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const W = 830;
  const H = 150;
  const pts = Array.from({ length: 60 }, (_, i) => {
    const x = (i / 59) * W;
    const y = H * 0.75 - i * 1.3 - Math.sin(i / 4) * 16 - Math.sin(i / 1.7) * 6 - (i > 30 ? (i - 30) * 1.2 : 0);
    return [x, Math.max(8, y)] as const;
  });
  const p = interpolate(frame, [start, start + 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const mark = (i: number, text: string, color: string) => {
    const [x, y] = pts[i];
    const o = p > i / 59 ? 1 : 0;
    return (
      <g opacity={o}>
        <circle cx={x} cy={y} r={9} fill={color} />
        <text x={x} y={y - 18} textAnchor="middle" fontFamily={F.mono} fontSize={18} fill={color}>
          {text}
        </text>
      </g>
    );
  };
  return (
    <svg width={W} height={H + 10} style={{ marginTop: 14, overflow: "visible" }}>
      <path d={d} fill="none" stroke={C.ink} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      {mark(6, "BUY", C.up)}
      {mark(40, "TAKE PROFIT", C.up)}
    </svg>
  );
};

/** 03 · Autopilot: tick the rules, it trades from its wallet every 5 minutes. */
export const Autopilot: React.FC = () => {
  const frame = useCurrentFrame();
  const vertical = useVertical();
  const win = useIn(8);
  const live = interpolate(frame, [150, 162], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Split caption={<Caption n="03 · Autopilot" title="It trades while you sleep." sub="Tick the rules. Your agent trades Argus tokens on Arc from its own wallet, every 5 minutes." />}>
      <div style={{ opacity: win, transform: `translateY(${(1 - win) * 60}px)` }}>
        <Window url="fuci.family/agent/alice · autopilot" width={vertical ? 920 : 900}>
          {RULES.map((r, i) => (
            <Rule key={r.label} label={r.label} value={r.value} at={30 + i * 16} />
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 18, borderTop: `1.5px solid ${C.line}` }}>
            <span style={{ fontFamily: F.mono, fontSize: 19, color: C.muted }}>Checks every 5 min · 1% per trade</span>
            <span
              style={{
                padding: "12px 26px",
                borderRadius: 999,
                background: live ? C.up : "#2a2a2a",
                color: live ? C.bg : C.ink2,
                fontFamily: F.body,
                fontWeight: 600,
                fontSize: 23,
                boxShadow: live ? `0 0 ${30 * live}px rgba(34,197,94,0.5)` : undefined,
              }}
            >
              {live ? "● Autopilot on" : "Autopilot off"}
            </span>
          </div>
          <Chart start={165} />
        </Window>
        <div style={{ marginTop: 26, display: "flex", gap: 14, justifyContent: "center", opacity: live }}>
          <Pill>Argus · Uniswap v4</Pill>
          <Pill>Withdraw anytime</Pill>
        </div>
      </div>
    </Split>
  );
};
