import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Frond, useVertical } from "../theme";

/** Frame timings, shared with scripts/tide.py so the sound lands on the picture. */
export const T = {
  lore1: 8, // "Old sailors read the tide on a wooden pole."
  lore2: 50, // "Beneath the Arc, we read ours on-chain."
  rise: 92, // the water starts climbing the gauge
  marks: [112, 142, 172, 202, 232, 262, 292] as const, // the water passes each mark
  line: 318, // "The tide doesn't ask. It rises."
  surge: 372, // the water covers everything
  cta: 384,
};

/** Every ERC-8004 agent on Arc, and the ones created on Fuci (fuci.family/api/stats/public, 26 Sep 2026). */
const ARC_AGENTS = 230;
const FUCI_AGENTS = 8;

/** Bottom to top: what Fuci has shipped, each one a line on the gauge. */
const MARKS = [
  "Agents get their own USDC wallet",
  "On-chain ID: ERC-8004 on Arc",
  "They pay per call over x402",
  "$FUCI bonded on Argus",
  "Dev bag locked for 1 year",
  "Fuci Market: 56 paid APIs",
  "Fund agents with card or bank",
];

const SEA = "#0e7c86";
const DEEP = "#04222e";
const FOAM = "#bff4ee";
const GREEN = "#22c55e";
const SAND = "#f0e6cf";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Mark i sits at this fraction of the pole's height; the top slot is left for the next agent. */
const markAt = (i: number) => (i + 1) / 9;

/**
 * 15 s: "The tide is rising". A harbour tide gauge; the water climbs past a line for everything Fuci
 * has shipped, then covers the screen. Sound: public/tide.wav from scripts/tide.py.
 */
export const Tide: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const v = useVertical();

  // The pole
  const poleX = v ? width * 0.2 : width * 0.3;
  const top = v ? 330 : 190;
  const bottom = height - (v ? 250 : 90);
  const poleH = bottom - top;
  const yAt = (f: number) => bottom - f * poleH;

  // Water level (fraction of the pole): passes mark i exactly at T.marks[i], then the surge.
  const level =
    frame < T.surge
      ? interpolate(frame, [0, T.rise, ...T.marks, T.line, T.surge], [-0.06, -0.02, ...MARKS.map((_, i) => markAt(i)), 0.84, 0.86], clamp)
      : interpolate(frame, [T.surge, T.cta], [0.86, 1.6], { ...clamp, easing: (t) => t * t });
  const surface = yAt(level);

  const wave = (amp: number, len: number, speed: number, phase: number) => {
    const pts: string[] = [];
    for (let x = -40; x <= width + 40; x += 20) pts.push(`${x},${surface + Math.sin(x / len + frame / speed + phase) * amp}`);
    return `M-40,${height + 10} L${pts.join(" L")} L${width + 40},${height + 10} Z`;
  };

  const lore = (at: number, out: number) => interpolate(frame, [at, at + 12, out - 10, out], [0, 1, 1, 0], clamp);
  const gauge = interpolate(frame, [T.lore2 + 20, T.rise, T.surge, T.cta], [0, 1, 1, 0], clamp);
  const bob = Math.sin(frame / 14) * 4;
  const cta = spring({ frame: frame - T.cta, fps, config: { damping: 15 } });

  const Line: React.FC<{ a: number; children: React.ReactNode; size: number; y: string }> = ({ a, children, size, y }) => (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: y,
        padding: "0 70px",
        textAlign: "center",
        fontFamily: F.display,
        fontWeight: 600,
        fontSize: size,
        letterSpacing: -1,
        lineHeight: 1.15,
        color: SAND,
        opacity: a,
        filter: `blur(${(1 - a) * 8}px)`,
        transform: `translateY(${(1 - a) * 18}px)`,
        textShadow: "0 4px 30px rgba(0,0,0,0.5)",
      }}
    >
      {children}
    </div>
  );

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #06121c 0%, #0b2231 55%, #0f3040 100%)", overflow: "hidden" }}>
      {/* Night sky, a low moon */}
      <div style={{ position: "absolute", right: v ? 120 : 220, top: v ? 150 : 90, width: v ? 120 : 110, height: v ? 120 : 110, borderRadius: "50%", background: "radial-gradient(circle at 40% 40%, #fff8e6, #e8dcc0 60%, #c9bb98)", boxShadow: "0 0 80px rgba(255,240,200,0.35)" }} />

      {/* Header */}
      <div style={{ position: "absolute", left: v ? 60 : 80, top: v ? 90 : 50, fontFamily: F.mono, fontSize: v ? 28 : 24, letterSpacing: 5, color: "#8fb9c0", opacity: gauge * interpolate(frame, [T.line - 10, T.line], [1, 0], clamp) }}>
        TIDE GAUGE · ARC MAINNET · <span style={{ color: FOAM }}>{Math.max(0, Math.round(Math.min(level, 1) * 100))}%</span>
      </div>

      {/* The water */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SEA} stopOpacity="0.92" />
            <stop offset="100%" stopColor={DEEP} stopOpacity="0.98" />
          </linearGradient>
        </defs>
        <path d={wave(v ? 16 : 14, 90, 9, 0)} fill={SEA} opacity={0.45} transform={`translate(0 ${-10 + bob})`} />
        <path d={wave(v ? 12 : 10, 140, 12, 2)} fill="url(#sea)" />
        <path d={wave(v ? 12 : 10, 140, 12, 2)} fill="none" stroke={FOAM} strokeWidth={3} opacity={0.7} />
      </svg>
      {/* Light shafts under the water */}
      <AbsoluteFill style={{ clipPath: `inset(${Math.max(0, surface)}px 0 0 0)`, opacity: 0.5 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ position: "absolute", top: 0, left: `${8 + i * 17}%`, width: 70, height: "100%", background: "linear-gradient(180deg, rgba(191,244,238,0.18), transparent 70%)", transform: `skewX(${-12 + Math.sin(frame / 30 + i) * 4}deg)` }} />
        ))}
      </AbsoluteFill>

      {/* The gauge pole */}
      <div style={{ position: "absolute", inset: 0, opacity: gauge }}>
        <div style={{ position: "absolute", left: poleX - 18, top: top - 40, width: 36, height: poleH + 120, borderRadius: 6, background: "linear-gradient(90deg, #6b4f33, #9c7a52 45%, #5a4029)", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }} />
        {/* The submerged part of the pole, seen through the water */}
        <div style={{ position: "absolute", left: poleX - 18, top: Math.max(surface, top - 40), width: 36, height: Math.max(0, bottom + 80 - Math.max(surface, top - 40)), background: "rgba(14,124,134,0.55)" }} />
        {/* Scale ticks */}
        {Array.from({ length: 37 }, (_, k) => {
          const y = yAt(k / 36);
          const big = k % 4 === 0;
          return <div key={k} style={{ position: "absolute", left: poleX - 18, top: y - 2, width: big ? 36 : 18, height: 4, background: "#f4ecd8", opacity: 0.85 }} />;
        })}
        {/* Milestone marks */}
        {MARKS.map((m, i) => {
          const y = yAt(markAt(i));
          const passed = frame >= T.marks[i];
          const pop = spring({ frame: frame - T.marks[i], fps, config: { damping: 12 } });
          return (
            <div key={m} style={{ position: "absolute", left: poleX + 34, top: y - (v ? 30 : 26), display: "flex", alignItems: "center", gap: v ? 18 : 16, whiteSpace: "nowrap" }}>
              <div style={{ width: v ? 40 : 60, height: 4, background: passed ? GREEN : "rgba(244,236,216,0.35)" }} />
              <div
                style={{
                  width: v ? 26 : 22,
                  height: v ? 26 : 22,
                  borderRadius: "50%",
                  background: passed ? GREEN : "transparent",
                  border: `3px solid ${passed ? GREEN : "rgba(244,236,216,0.35)"}`,
                  transform: `scale(${passed ? 1 + 0.4 * (1 - pop) : 1})`,
                  boxShadow: passed ? "0 0 24px rgba(34,197,94,0.6)" : "none",
                }}
              />
              <div
                style={{
                  fontFamily: F.display,
                  fontWeight: 600,
                  fontSize: v ? 38 : 44,
                  color: passed ? "#fff" : "rgba(244,236,216,0.32)",
                  transform: `translateX(${passed ? (1 - pop) * 30 : 0}px)`,
                  textShadow: passed ? "0 2px 20px rgba(0,0,0,0.6)" : "none",
                }}
              >
                {m}
              </div>
            </div>
          );
        })}
        {/* The empty top slot */}
        <div style={{ position: "absolute", left: poleX + 34, top: yAt(8 / 9) - (v ? 30 : 26), display: "flex", alignItems: "center", gap: 16, whiteSpace: "nowrap" }}>
          <div style={{ width: v ? 40 : 60, height: 0, borderTop: "4px dashed rgba(34,197,94,0.8)" }} />
          <div style={{ fontFamily: F.mono, fontSize: v ? 34 : 32, color: GREEN, letterSpacing: 3, opacity: 0.6 + 0.4 * Math.sin(frame / 8) }}>NEXT: YOUR AGENT</div>
        </div>
      </div>

      {/* The lore */}
      <Line a={lore(T.lore1, T.lore2)} size={v ? 70 : 72} y={v ? "38%" : "36%"}>
        Old sailors read the tide
        <br />
        on a wooden pole.
      </Line>
      <Line a={lore(T.lore2, T.rise + 8)} size={v ? 70 : 72} y={v ? "38%" : "36%"}>
        Beneath the Arc,
        <br />
        we read ours <span style={{ color: GREEN }}>on-chain</span>.
      </Line>
      <Line a={lore(T.line, T.surge + 4)} size={v ? 84 : 92} y={v ? "8%" : "2%"}>
        The tide doesn&apos;t ask.
        <br />
        <span style={{ color: FOAM }}>It rises.</span>
      </Line>

      {/* Call to action, under the water */}
      {frame >= T.cta && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 28 : 22, opacity: cta, transform: `translateY(${(1 - cta) * 30}px)`, padding: "0 50px", textAlign: "center" }}>
            <Frond size={v ? 120 : 100} draw={false} />
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 108 : 118, letterSpacing: -3, color: "#fff", lineHeight: 1 }}>
              High tide {v && <br />}is <span style={{ color: FOAM }}>coming.</span>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: v ? 30 : 28, color: "#9fd6d0", letterSpacing: 3 }}>
              {ARC_AGENTS} AI AGENTS ON ARC · {FUCI_AGENTS} BORN ON FUCI
            </div>
            <div style={{ fontFamily: F.body, fontSize: v ? 40 : 38, color: "#e6f4f1" }}>
              Spawn your agent for <span style={{ color: GREEN, fontWeight: 600 }}>$1</span>.
            </div>
            <div style={{ fontFamily: F.mono, fontSize: v ? 36 : 34, color: GREEN, letterSpacing: 2 }}>fuci.family · $FUCI</div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
