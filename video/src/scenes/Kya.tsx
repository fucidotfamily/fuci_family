import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, Frond } from "../theme";

/**
 * 15 s: "Know Your Agent", a security checkpoint for AI agents. A trusted agent is scanned, passes four
 * checks, gets an A and receives the USDC. An anonymous wallet fails (no ERC-8004 identity, empty history),
 * gets an F and the coin stays locked. Then a crowd of Arc agents gets graded, and the end card.
 * Timed to public/kya.wav (scripts/kya.py). No flashing: every light change is a slow fade.
 */
export const T = {
  in1: 0, scan1: 40, stamp1: 86, pay1: 98, out1: 124,
  in2: 146, scan2: 180, stamp2: 226, lock2: 236, out2: 262,
  grid: 292, gridStep: 2, end: 366, dur: 450,
};
export const SCAN_LEN = 38;
export const CHECK_AT = (scan: number, i: number) => scan + 8 + i * 8;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const G = C.up;
const RED = "#ef4444";
const AMBER = "#f59e0b";
const CYAN = "#5eead4";
const GRADE: Record<string, string> = { A: "#22c55e", B: "#84cc16", C: AMBER, D: "#f97316", F: RED };
const GATE_X = 960;
const FLOOR_Y = 800;

type Check = { label: string; ok: boolean | null };
const GOOD: Check[] = [
  { label: "ERC-8004 ID", ok: true },
  { label: "Reputation", ok: true },
  { label: "Wallet history", ok: true },
  { label: "x402 payments", ok: true },
];
const BAD: Check[] = [
  { label: "ERC-8004 ID", ok: false },
  { label: "Reputation", ok: null },
  { label: "Wallet history", ok: false },
  { label: "x402 payments", ok: null },
];

/** A friendly robot head; the anonymous one is a hooded shape with a "?" face. */
const Agent: React.FC<{ kind: "good" | "anon" | "mini"; size: number; tint?: string }> = ({ kind, size, tint = G }) => {
  const frame = useCurrentFrame();
  const blink = kind !== "anon" && frame % 90 > 84 ? 0.15 : 1;
  if (kind === "anon") {
    return (
      <svg width={size} height={size} viewBox="0 0 200 200">
        <path d="M100 18c-48 0-78 36-78 86v70c0 8 6 12 14 12h128c8 0 14-4 14-12v-70c0-50-30-86-78-86z" fill="#1c1c22" stroke="#3a3a46" strokeWidth={4} />
        <path d="M100 52c-30 0-50 24-50 56v44h100v-44c0-32-20-56-50-56z" fill="#07070a" />
        <text x="100" y="138" textAnchor="middle" fontFamily={F.display} fontWeight={700} fontSize={64} fill="#4b4b58">
          ?
        </text>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      <line x1="100" y1="10" x2="100" y2="38" stroke={tint} strokeWidth={6} strokeLinecap="round" />
      <circle cx="100" cy="10" r="9" fill={tint} />
      <rect x="26" y="38" width="148" height="132" rx="34" fill="#0d1a12" stroke={tint} strokeWidth={6} />
      <rect x="48" y="66" width="104" height="60" rx="20" fill="#050a07" />
      <ellipse cx="78" cy="96" rx="10" ry={12 * blink} fill={tint} />
      <ellipse cx="122" cy="96" rx="10" ry={12 * blink} fill={tint} />
      <path d="M80 146c12 8 28 8 40 0" stroke={tint} strokeWidth={6} fill="none" strokeLinecap="round" />
      <rect x="12" y="84" width="14" height="36" rx="7" fill={tint} opacity={0.6} />
      <rect x="174" y="84" width="14" height="36" rx="7" fill={tint} opacity={0.6} />
    </svg>
  );
};

const Coin: React.FC<{ size: number; locked: number }> = ({ size, locked }) => (
  <div style={{ position: "relative", width: size, height: size }}>
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#2775ca" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="#fff" strokeWidth={4} opacity={0.9} />
      <text x="50" y="64" textAnchor="middle" fontFamily={F.display} fontWeight={700} fontSize={40} fill="#fff">
        $
      </text>
    </svg>
    {locked > 0 && (
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 60 60" style={{ position: "absolute", right: -size * 0.12, bottom: -size * 0.08, opacity: locked, transform: `scale(${0.6 + 0.4 * locked})` }}>
        <rect x="8" y="26" width="44" height="30" rx="7" fill={RED} />
        <path d="M18 26v-8a12 12 0 0 1 24 0v8" stroke={RED} strokeWidth={7} fill="none" />
        <circle cx="30" cy="40" r="5" fill="#fff" />
      </svg>
    )}
  </div>
);

const Gate: React.FC<{ glow: string; glowAmt: number }> = ({ glow, glowAmt }) => (
  <>
    {[GATE_X - 190, GATE_X + 160].map((x) => (
      <div
        key={x}
        style={{
          position: "absolute",
          left: x,
          top: 300,
          width: 30,
          height: FLOOR_Y - 300,
          borderRadius: 15,
          background: "linear-gradient(180deg,#1b1f1d,#0c0e0d)",
          border: "1px solid #2a302d",
          boxShadow: `0 0 ${60 * glowAmt}px ${glow}`,
        }}
      >
        <div style={{ position: "absolute", left: 11, top: 24, bottom: 24, width: 8, borderRadius: 4, background: glow, opacity: 0.25 + 0.75 * glowAmt }} />
      </div>
    ))}
  </>
);

const ScanBeam: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + SCAN_LEN], [0, 1], clamp);
  const vis = interpolate(frame, [start, start + 4, start + SCAN_LEN - 4, start + SCAN_LEN], [0, 1, 1, 0], clamp);
  const y = 320 + p * (FLOOR_Y - 340);
  return (
    <div style={{ position: "absolute", left: GATE_X - 160, width: 320, top: y - 60, height: 70, opacity: vis }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent, ${CYAN}33)` }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, borderRadius: 2, background: CYAN, boxShadow: `0 0 24px ${CYAN}` }} />
    </div>
  );
};

const Checks: React.FC<{ scan: number; list: Check[]; hideAt: number }> = ({ scan, list, hideAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(frame, [hideAt, hideAt + 12], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 1270, top: 340, display: "flex", flexDirection: "column", gap: 18, opacity: out }}>
      {list.map((c, i) => {
        const a = spring({ frame: frame - CHECK_AT(scan, i), fps, config: { damping: 16 } });
        const col = c.ok === true ? G : c.ok === false ? RED : "#6b7280";
        return (
          <div
            key={c.label}
            style={{
              opacity: a,
              transform: `translateX(${(1 - a) * 40}px)`,
              display: "flex",
              alignItems: "center",
              gap: 18,
              width: 460,
              padding: "16px 22px",
              borderRadius: 16,
              border: `1px solid ${col}55`,
              background: "rgba(12,14,13,0.9)",
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 20, background: `${col}22`, border: `2px solid ${col}`, display: "flex", alignItems: "center", justifyContent: "center", color: col, fontFamily: F.display, fontWeight: 700, fontSize: 24 }}>
              {c.ok === true ? "✓" : c.ok === false ? "✕" : "–"}
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 28, color: c.ok === null ? "#8b8b95" : C.ink }}>{c.label}</div>
          </div>
        );
      })}
    </div>
  );
};

const Stamp: React.FC<{ at: number; grade: string; size: number; style?: React.CSSProperties }> = ({ at, grade, size, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at) return null;
  const s = spring({ frame: frame - at, fps, config: { damping: 11, stiffness: 180 } });
  const col = GRADE[grade];
  return (
    <div
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size * 0.2,
        border: `${Math.max(3, size * 0.05)}px solid ${col}`,
        background: "rgba(0,0,0,0.85)",
        color: col,
        fontFamily: F.display,
        fontWeight: 700,
        fontSize: size * 0.7,
        lineHeight: `${size * 0.92}px`,
        textAlign: "center",
        transform: `scale(${2 - s}) rotate(${(1 - s) * -30 - 8}deg)`,
        opacity: Math.min(1, s * 1.4),
        boxShadow: `0 0 ${30 * s}px ${col}66`,
        ...style,
      }}
    >
      {grade}
    </div>
  );
};

/** Agents on Arc, graded one after another (a spread like the real directory: few A's, many C/D). */
const GRID = "CDBFDCACDDBFCDCADCBDFCDA".split("");

const Crowd: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vis = interpolate(frame, [T.grid - 8, T.grid + 10, T.end - 14, T.end], [0, 1, 1, 0], clamp);
  if (vis <= 0) return null;
  const cols = 8;
  const cell = 170;
  const x0 = GATE_X - (cols * cell) / 2;
  return (
    <AbsoluteFill style={{ opacity: vis }}>
      {GRID.map((g, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const a = spring({ frame: frame - (T.grid + i * 1), fps, config: { damping: 18 } });
        return (
          <div key={i} style={{ position: "absolute", left: x0 + col * cell + 25, top: 250 + row * 200, opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>
            <Agent kind="mini" size={120} tint={i % 3 === 0 ? CYAN : i % 3 === 1 ? G : "#a3e635"} />
            <Stamp at={T.grid + 10 + i * T.gridStep} grade={g} size={62} style={{ left: 78, top: -12 }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const End: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < T.end - 4) return null;
  const a = spring({ frame: frame - T.end, fps, config: { damping: 18 } });
  const b = spring({ frame: frame - (T.end + 14), fps, config: { damping: 18 } });
  const c = spring({ frame: frame - (T.end + 26), fps, config: { damping: 18 } });
  const sweep = interpolate(frame, [T.end + 4, T.end + 40], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const fade = interpolate(frame, [T.dur - 14, T.dur - 1], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fade }}>
      <div style={{ position: "relative", width: 220, height: 220, opacity: a, transform: `scale(${0.8 + 0.2 * a})` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 110, border: `3px solid ${G}`, boxShadow: `0 0 60px ${G}55`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#07120b" }}>
          <Frond size={120} draw={false} />
          <div style={{ position: "absolute", left: 0, right: 0, top: `${sweep * 100}%`, height: 3, background: CYAN, boxShadow: `0 0 18px ${CYAN}`, opacity: sweep < 1 ? 1 : 0 }} />
        </div>
        <Stamp at={T.end + 40} grade="A" size={84} style={{ right: -34, top: -18 }} />
      </div>
      <div style={{ marginTop: 44, opacity: b, transform: `translateY(${(1 - b) * 18}px)`, fontFamily: F.display, fontWeight: 700, fontSize: 104, letterSpacing: -4, color: C.ink }}>
        Know Your Agent
      </div>
      <div style={{ marginTop: 18, opacity: c, fontFamily: F.mono, fontSize: 40, color: G }}>fuci.family/kya</div>
    </AbsoluteFill>
  );
};

export const Kya: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Agent 1: walks in, is scanned, gets paid, walks through.
  const in1 = spring({ frame: frame - T.in1, fps, config: { damping: 20 } });
  const out1 = interpolate(frame, [T.out1, T.out1 + 26], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const a1x = -300 + in1 * (GATE_X + 300) + out1 * 1300;
  // Agent 2: walks in, fails, is sent back.
  const in2 = spring({ frame: frame - T.in2, fps, config: { damping: 20 } });
  const back2 = interpolate(frame, [T.out2, T.out2 + 30], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const a2x = -300 + in2 * (GATE_X + 300) - back2 * 1300;

  // Coin: hovers above the gate; drops into agent 1; a new coin appears and gets locked for agent 2.
  const drop = interpolate(frame, [T.pay1, T.pay1 + 16], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const coin2 = interpolate(frame, [T.out1 + 6, T.out1 + 22], [0, 1], clamp);
  const lock = interpolate(frame, [T.lock2, T.lock2 + 12], [0, 1], clamp);
  const bob = Math.sin(frame / 9) * 6;

  // Gate light: neutral, then green (approved) or red (denied), always as slow fades.
  const greenAmt = interpolate(frame, [T.stamp1, T.stamp1 + 10, T.out1 + 10, T.out1 + 30], [0, 1, 1, 0], clamp);
  const redAmt = interpolate(frame, [T.stamp2, T.stamp2 + 10, T.out2 + 20, T.out2 + 40], [0, 1, 1, 0], clamp);
  const glow = redAmt > 0.01 ? RED : G;
  const glowAmt = Math.max(greenAmt, redAmt);
  const checkpoint = interpolate(frame, [T.grid - 18, T.grid], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: "radial-gradient(1400px 800px at 50% 40%, #0a1411 0%, #030605 55%, #000 100%)" }}>
      {/* floor */}
      <div style={{ position: "absolute", left: 0, right: 0, top: FLOOR_Y, height: 2, background: "linear-gradient(90deg, transparent, #1f3a2c, transparent)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: FLOOR_Y, bottom: 0, background: "linear-gradient(180deg, rgba(34,197,94,0.05), transparent)" }} />

      <AbsoluteFill style={{ opacity: checkpoint }}>
        <Gate glow={glow} glowAmt={glowAmt} />
        {/* coin 1 */}
        {frame < T.pay1 + 16 && (
          <div style={{ position: "absolute", left: GATE_X - 55, top: 150 + bob * (1 - drop) + drop * 330, opacity: 1 - drop * 0.9, transform: `scale(${1 - drop * 0.5})` }}>
            <Coin size={110} locked={0} />
          </div>
        )}
        {/* coin 2 */}
        {coin2 > 0 && (
          <div style={{ position: "absolute", left: GATE_X - 55, top: 150 + bob, opacity: coin2 }}>
            <Coin size={110} locked={lock} />
          </div>
        )}
        {/* agent 1 */}
        {frame < T.out1 + 28 && (
          <div style={{ position: "absolute", left: a1x - 130, top: FLOOR_Y - 270 + Math.abs(Math.sin(frame / 5)) * (in1 < 0.98 || out1 > 0 ? 8 : 0) }}>
            <div style={{ position: "relative" }}>
              <Agent kind="good" size={260} />
              <Stamp at={T.stamp1} grade="A" size={120} style={{ right: -40, top: -30 }} />
              {/* received glow */}
              <div style={{ position: "absolute", inset: 20, borderRadius: 60, boxShadow: `0 0 ${80 * greenAmt}px ${G}`, pointerEvents: "none" }} />
            </div>
          </div>
        )}
        {/* agent 2 */}
        {frame >= T.in2 && frame < T.out2 + 32 && (
          <div style={{ position: "absolute", left: a2x - 130, top: FLOOR_Y - 270 + Math.abs(Math.sin(frame / 5)) * (in2 < 0.98 || back2 > 0 ? 8 : 0), opacity: 1 - back2 * 0.6 }}>
            <div style={{ position: "relative" }}>
              <Agent kind="anon" size={260} />
              <Stamp at={T.stamp2} grade="F" size={120} style={{ right: -40, top: -30 }} />
            </div>
          </div>
        )}
        <ScanBeam start={T.scan1} />
        <ScanBeam start={T.scan2} />
        {frame >= T.scan1 && frame < T.in2 && <Checks scan={T.scan1} list={GOOD} hideAt={T.out1} />}
        {frame >= T.scan2 && frame < T.grid && <Checks scan={T.scan2} list={BAD} hideAt={T.out2} />}
      </AbsoluteFill>

      <Crowd />
      <End />
    </AbsoluteFill>
  );
};
