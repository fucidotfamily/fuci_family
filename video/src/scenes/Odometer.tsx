import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, F, Frond } from "../theme";

/**
 * 15 s: "Fuci, by the numbers". Four mechanical odometers roll up one after another to live numbers read
 * from www.fuci.family/api/stats/public, then the places Fuci is listed, then the end card.
 * Timed to public/odometer.wav (scripts/odometer.py). No flashing: highlights are slow fades.
 */
export const T = { title: 0, roll: 40, step: 72, rollLen: 42, end: 352, dur: 450 };
export const ROLL_AT = (i: number) => T.roll + i * T.step;

/** Live from www.fuci.family/api/stats on 2026-09-28. */
const STATS = [
  { value: 39, label: "agents spawned", sub: "each with its own USDC wallet" },
  { value: 12, label: "agents on-chain", sub: "of 323 AI agents on Arc" },
  { value: 62, label: "autopilot trades", sub: "filled on Argus pools" },
  { value: 952, label: "x402 calls paid", sub: "by agents, in USDC" },
];

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const G = C.up;
const DIGIT_H = 132;

/** One odometer wheel: rolls through whole turns and lands on `digit`, easing into place. */
const Wheel: React.FC<{ digit: number; start: number; turns: number; len: number }> = ({ digit, start, turns, len }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [start, start + len], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.6, 0.15, 1) });
  const pos = p * (turns * 10 + digit);
  const y = -(pos % 20) * DIGIT_H;
  return (
    <div
      style={{
        width: 100,
        height: DIGIT_H,
        overflow: "hidden",
        position: "relative",
        background: "linear-gradient(#050505, #161616 18%, #1d1d1d 50%, #161616 82%, #050505)",
        borderRadius: 10,
        border: `1px solid ${C.line}`,
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: y }}>
        {Array.from({ length: 21 }, (_, k) => (
          <div key={k} style={{ height: DIGIT_H, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.mono, fontWeight: 500, fontSize: 96, color: C.ink }}>
            {k % 10}
          </div>
        ))}
      </div>
      {/* glass: dark at the top and bottom so the digits look curved */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(rgba(0,0,0,0.75), transparent 30%, transparent 70%, rgba(0,0,0,0.75))" }} />
    </div>
  );
};

const Counter: React.FC<{ i: number }> = ({ i }) => {
  const f = useCurrentFrame();
  const s = STATS[i];
  const start = ROLL_AT(i);
  const digits = String(s.value).padStart(4, "0").split("").map(Number);
  // The counter being rolled is lit; the rest wait dimmed, then settle to full once all have rolled.
  const lit = interpolate(f, [start - 8, start, start + T.step - 4, start + T.step + 6], [0.35, 1, 1, 0.75], clamp);
  const o = lit;
  const landed = interpolate(f, [start + T.rollLen - 4, start + T.rollLen + 8], [0, 1], clamp);
  return (
    <div style={{ opacity: o, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: 16,
          borderRadius: 18,
          background: "#0b0b0b",
          border: `2px solid ${landed > 0 && f < start + T.step + 6 ? `rgba(34,197,94,${0.3 + landed * 0.6})` : C.line}`,
          boxShadow: "inset 0 2px 12px rgba(0,0,0,0.8)",
        }}
      >
        {digits.map((d, k) => (
          <Wheel key={k} digit={d} start={start + k * 3} turns={4 - k + 1} len={T.rollLen - k * 3} />
        ))}
      </div>
      <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 40, color: C.ink, marginTop: 22 }}>{s.label}</div>
      <div style={{ fontFamily: F.mono, fontSize: 22, color: landed > 0.5 ? G : C.muted, marginTop: 6 }}>{s.sub}</div>
    </div>
  );
};

const Title: React.FC = () => {
  const f = useCurrentFrame();
  const p = interpolate(f, [2, 20], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const up = interpolate(f, [T.roll - 14, T.roll + 4], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: interpolate(up, [0, 1], [430, 70]),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: p,
        transform: `scale(${interpolate(up, [0, 1], [1.25, 0.8])})`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: F.mono, fontSize: 24, letterSpacing: 6, color: G }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: G }} /> LIVE FROM ARC
      </div>
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 92, color: C.ink, marginTop: 12 }}>Fuci, by the numbers</div>
    </div>
  );
};

const End: React.FC = () => {
  const f = useCurrentFrame();
  const p = interpolate(f, [T.end, T.end + 18], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: p, background: C.bg }}>
      <Frond size={150} delay={T.end} />
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 104, color: C.ink, marginTop: 22 }}>fuci.family</div>
      <div style={{ fontFamily: F.mono, fontSize: 28, color: C.ink2, marginTop: 20 }}>AI agents that pay their own way, on Arc</div>
      <div style={{ fontFamily: F.mono, fontSize: 22, color: C.muted, marginTop: 30 }}>every number checkable at fuci.family/stats</div>
    </AbsoluteFill>
  );
};

export const Odometer: React.FC = () => {
  const f = useCurrentFrame();
  const grid = interpolate(f, [T.roll - 10, T.roll + 6], [0, 1], clamp);
  const out = interpolate(f, [T.end - 4, T.end + 14], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* soft vignette glow behind the counters */}
      <AbsoluteFill style={{ background: "radial-gradient(1200px 700px at 50% 55%, rgba(34,197,94,0.07), transparent 70%)" }} />
      <AbsoluteFill style={{ opacity: out }}>
        <Title />
        <div
          style={{
            position: "absolute",
            left: 160,
            right: 160,
            top: 290,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            rowGap: 70,
            justifyItems: "center",
            opacity: grid,
          }}
        >
          {STATS.map((_, i) => (
            <Counter key={i} i={i} />
          ))}
        </div>
      </AbsoluteFill>
      {f >= T.end - 4 && <End />}
    </AbsoluteFill>
  );
};
