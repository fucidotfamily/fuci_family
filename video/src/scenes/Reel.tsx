import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { getLength, getPointAtLength } from "@remotion/paths";
import { C, F, Frond, useVertical } from "../theme";

/** 128 BPM: one bar (4 beats) = 56.25 frames. Every scene is one bar; shared with scripts/reel.py. */
export const BPM = 128;
export const BAR = (60 / BPM) * 4 * 30;
export const CUTS = Array.from({ length: 9 }, (_, i) => Math.round(i * BAR)); // 0, 56, 113, 169, 225, 281, 338, 394, 450

/** Live numbers (fuci.family/api/stats/public and /api/market, 26 Sep 2026). */
const N = { arc: 287, fuci: 8, calls: 277, apis: 58, sellers: 11 };

const G = "#22c55e";
const LIME = "#a3e635";
const CYAN = "#38bdf8";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1); // expo-out
const easeIn = Easing.bezier(0.7, 0, 0.84, 0);
const rnd = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/* ------------------------------------------------------------------ transitions */

type WipeKind = "circle" | "diagonal" | "blinds" | "iris" | "push" | "split";

/** Reveals its children over whatever is underneath with a shaped mask (10 frames, expo-out). */
const Wipe: React.FC<{ kind: WipeKind; children: React.ReactNode; dur?: number }> = ({ kind, children, dur = 12 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = interpolate(frame, [0, dur], [0, 1], { ...clamp, easing: ease });
  const diag = Math.hypot(width, height);
  let clip = "none";
  let transform = "none";
  if (p < 1) {
    if (kind === "circle") clip = `circle(${p * diag * 0.6}px at 50% 50%)`;
    if (kind === "iris") clip = `circle(${p * diag * 0.6}px at 50% 50%)`;
    if (kind === "diagonal") clip = `polygon(0 0, ${p * 200}% 0, ${p * 200 - 100}% 100%, 0 100%)`;
    if (kind === "split") clip = `inset(${(1 - p) * 50}% 0 ${(1 - p) * 50}% 0)`;
    if (kind === "push") transform = `translateX(${(1 - p) * 100}%)`;
  }
  if (kind === "blinds" && p < 1) {
    const n = 8;
    const polys = Array.from({ length: n }, (_, i) => {
      const y0 = (i / n) * 100;
      const y1 = y0 + (100 / n) * Math.min(1, Math.max(0, p * 1.6 - i * 0.07));
      return `M0 ${y0} H100 V${y1} H0 Z`;
    }).join(" ");
    return (
      <AbsoluteFill>
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <clipPath id="blinds" clipPathUnits="objectBoundingBox">
            <path d={polys} transform="scale(0.01)" />
          </clipPath>
        </svg>
        <AbsoluteFill style={{ clipPath: "url(#blinds)" }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={{ clipPath: clip, transform }}>{children}</AbsoluteFill>;
};

/** A letter that rises out of a mask. */
const Rise: React.FC<{ children: React.ReactNode; at: number; style?: React.CSSProperties; from?: number }> = ({ children, at, style, from = 110 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 14], [0, 1], { ...clamp, easing: ease });
  return (
    <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", ...style }}>
      <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * from}%)` }}>{children}</span>
    </span>
  );
};

const Dots: React.FC<{ color?: string; gap?: number; opacity?: number }> = ({ color = "#fff", gap = 48, opacity = 0.08 }) => (
  <AbsoluteFill style={{ backgroundImage: `radial-gradient(${color} 1.5px, transparent 1.5px)`, backgroundSize: `${gap}px ${gap}px`, opacity }} />
);

/* ------------------------------------------------------------------ 1. logo build */

const S1Logo: React.FC = () => {
  const frame = useCurrentFrame();
  const v = useVertical();
  const bar = interpolate(frame, [24, 44], [0, 1], { ...clamp, easing: ease });
  const zoom = interpolate(frame, [0, 60], [1.15, 1], { ...clamp, easing: ease });
  const size = v ? 230 : 250;
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center" }}>
      <Dots />
      {/* rotating guide rings */}
      <svg width={900} height={900} style={{ position: "absolute", transform: `rotate(${frame * 1.2}deg)`, opacity: 0.35 }}>
        <circle cx={450} cy={450} r={330} fill="none" stroke={G} strokeWidth={2} strokeDasharray="4 18" />
        <circle cx={450} cy={450} r={410} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={1} strokeDasharray={`${interpolate(frame, [0, 40], [0, 2600], clamp)} 3000`} />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, transform: `scale(${zoom})` }}>
        <Frond size={v ? 160 : 150} delay={0} />
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: size, lineHeight: 0.9, letterSpacing: -10, color: "#fff", display: "flex" }}>
          {"fuci".split("").map((ch, i) => (
            <Rise key={i} at={10 + i * 4}>
              {ch}
            </Rise>
          ))}
        </div>
        <div style={{ width: (v ? 520 : 560) * bar, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${G}, ${LIME})` }} />
        <div style={{ fontFamily: F.mono, fontSize: v ? 26 : 24, letterSpacing: 8, color: "#9ca3af", opacity: bar }}>AI AGENTS · ARC MAINNET</div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 2. shape morph */

/** Polar radius of a shape at angle a: 0 circle, 1 hexagon, 2 eight-point star. */
const radius = (shape: number, a: number) => {
  const hex = Math.cos(Math.PI / 6) / Math.cos(((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6);
  const star = 0.78 + 0.22 * Math.cos(8 * a);
  const s = [1, hex, star];
  const i = Math.floor(shape);
  const t = shape - i;
  return s[Math.min(2, i)] * (1 - t) + s[Math.min(2, i + 1)] * t;
};

const S2Morph: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const v = useVertical();
  // circle → hexagon → star, one beat each with an expo snap
  const beat = BAR / 4;
  const shape = interpolate(frame, [beat * 1 - 6, beat * 1 + 6, beat * 2.2 - 6, beat * 2.2 + 6], [0, 1, 1, 2], { ...clamp, easing: ease });
  const R = v ? 250 : 230;
  const cx = v ? width / 2 : width * 0.32;
  const cy = v ? height * 0.38 : height / 2;
  const pts = Array.from({ length: 180 }, (_, k) => {
    const a = (k / 180) * Math.PI * 2 + frame * 0.01;
    const r = R * radius(shape, a - frame * 0.01 + Math.PI / 2);
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(" ");
  const idx = shape < 0.5 ? 0 : shape < 1.5 ? 1 : 2;
  const labels = [
    { big: "WALLET", small: "its own USDC", icon: "$" },
    { big: "IDENTITY", small: "ERC-8004, on-chain", icon: "#" },
    { big: "AGENT", small: "thinks · pays · acts", icon: "✦" },
  ];
  const changeAt = [0, beat * 1, beat * 2.2][idx];
  const lp = interpolate(frame, [changeAt, changeAt + 12], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: "#050807" }}>
      <Dots color={G} gap={40} opacity={0.12} />
      <svg width={width} height={height} style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={G} />
            <stop offset="1" stopColor={LIME} />
          </linearGradient>
        </defs>
        {[1.35, 1.18].map((s, i) => (
          <polygon key={i} points={pts} fill="none" stroke={G} strokeOpacity={0.25 - i * 0.08} strokeWidth={2} transform={`translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy}) rotate(${-frame * (i + 1) * 0.6} ${cx} ${cy})`} />
        ))}
        <polygon points={pts} fill="url(#mg)" />
      </svg>
      <div style={{ position: "absolute", left: cx - 150, top: cy - 150, width: 300, height: 300, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.display, fontWeight: 700, fontSize: 170, color: "#04130a", transform: `scale(${0.6 + 0.4 * lp}) rotate(${(1 - lp) * -30}deg)` }}>
        {labels[idx].icon}
      </div>
      <div style={{ position: "absolute", left: v ? 0 : width * 0.58, right: v ? 0 : 60, top: v ? height * 0.66 : height * 0.36, textAlign: v ? "center" : "left" }}>
        <div style={{ fontFamily: F.mono, fontSize: v ? 28 : 26, letterSpacing: 6, color: G }}>EVERY AGENT GETS A</div>
        <div style={{ overflow: "hidden", height: v ? 150 : 170 }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 140 : 160, letterSpacing: -6, color: "#fff", lineHeight: 1.05, transform: `translateY(${(1 - lp) * 100}%)` }}>{labels[idx].big}</div>
        </div>
        <div style={{ fontFamily: F.body, fontSize: v ? 38 : 38, color: "#cbd5d1", opacity: lp }}>{labels[idx].small}</div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 3. tile flip wave */

const S3Grid: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const v = useVertical();
  const cols = v ? 5 : 8;
  const rows = v ? 9 : 5;
  const tw = width / cols;
  const th = height / rows;
  const count = Math.round(interpolate(frame, [14, 44], [0, N.arc], { ...clamp, easing: ease }));
  const big = spring({ frame: frame - 12, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ background: "#020403", perspective: 1400 }}>
      {Array.from({ length: cols * rows }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const d = (c + r) * 1.6;
        const flip = interpolate(frame, [d, d + 14], [0, 180], { ...clamp, easing: ease });
        const green = rnd(i) < N.fuci / 40;
        return (
          <div key={i} style={{ position: "absolute", left: c * tw + 6, top: r * th + 6, width: tw - 12, height: th - 12, transformStyle: "preserve-3d", transform: `rotateY(${flip}deg)` }}>
            <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: 14, background: "#0d1310", border: "1px solid #1f2a24", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.mono, fontSize: 24, color: "#3f4f46" }}>
              #{Math.floor(rnd(i + 99) * N.arc) + 1}
            </div>
            <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: 14, background: green ? G : "#111a15", border: `1px solid ${green ? LIME : "#23332a"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: green ? "#04130a" : G, opacity: green ? 1 : 0.5 }} />
            </div>
          </div>
        );
      })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at center, rgba(2,4,3,0.92) 0%, rgba(2,4,3,0.7) 35%, transparent 70%)" }}>
        <div style={{ textAlign: "center", transform: `scale(${0.7 + 0.3 * big})`, opacity: Math.min(1, big * 1.4) }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 300 : 320, letterSpacing: -14, color: "#fff", lineHeight: 0.9, fontVariantNumeric: "tabular-nums" }}>{count}</div>
          <div style={{ fontFamily: F.mono, fontSize: v ? 32 : 30, letterSpacing: 8, color: G, marginTop: 16 }}>AI AGENTS ON ARC</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 4. payment flow */

const S4Flow: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const v = useVertical();
  const nodes = v
    ? [
        { x: width / 2, y: height * 0.2, label: "AGENT", sub: "needs data" },
        { x: width * 0.3, y: height * 0.42, label: "x402", sub: "402 · price" },
        { x: width * 0.7, y: height * 0.6, label: "USDC", sub: "pays per call" },
        { x: width / 2, y: height * 0.8, label: "ARC", sub: "settled" },
      ]
    : [
        { x: width * 0.12, y: height * 0.55, label: "AGENT", sub: "needs data" },
        { x: width * 0.38, y: height * 0.32, label: "x402", sub: "402 · price" },
        { x: width * 0.62, y: height * 0.68, label: "USDC", sub: "pays per call" },
        { x: width * 0.88, y: height * 0.45, label: "ARC", sub: "settled" },
      ];
  const paths = nodes.slice(1).map((b, i) => {
    const a = nodes[i];
    const mx = (a.x + b.x) / 2;
    return v ? `M ${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}` : `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  });
  return (
    <AbsoluteFill style={{ background: "#03060a" }}>
      <Dots color={CYAN} gap={56} opacity={0.1} />
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {paths.map((d, i) => {
          const len = getLength(d);
          const draw = interpolate(frame, [4 + i * 8, 20 + i * 8], [0, 1], { ...clamp, easing: ease });
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="#1e293b" strokeWidth={10} strokeLinecap="round" />
              <path d={d} fill="none" stroke={i === 1 ? G : CYAN} strokeWidth={4} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
              {/* packets with trails */}
              {Array.from({ length: 3 }, (_, k) => {
                const t = ((frame - 18 - i * 6 + k * 9) / 26) % 1;
                if (frame < 18 + i * 6 || t < 0) return null;
                return Array.from({ length: 6 }, (_, j) => {
                  const tt = Math.max(0, t - j * 0.018);
                  const pt = getPointAtLength(d, tt * len);
                  if (!pt) return null;
                  return <circle key={`${k}-${j}`} cx={pt.x} cy={pt.y} r={9 - j * 1.3} fill={i === 1 ? LIME : "#e0f2fe"} opacity={1 - j * 0.16} />;
                });
              })}
            </g>
          );
        })}
      </svg>
      {nodes.map((n, i) => {
        const s = spring({ frame: frame - i * 8, fps, config: { damping: 11 } });
        return (
          <div key={n.label} style={{ position: "absolute", left: n.x - 110, top: n.y - 70, width: 220, height: 140, borderRadius: 26, background: i === 3 ? G : "#0b1220", border: `2px solid ${i === 3 ? LIME : "#1e3a5f"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${s})`, boxShadow: i === 3 ? "0 0 60px rgba(34,197,94,0.45)" : "none" }}>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 48, color: i === 3 ? "#04130a" : "#fff" }}>{n.label}</div>
            <div style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: 2, color: i === 3 ? "#064e1f" : "#7dd3fc" }}>{n.sub}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: v ? height * 0.05 : height * 0.08, textAlign: "center", fontFamily: F.display, fontWeight: 600, fontSize: v ? 56 : 58, color: "#e2e8f0" }}>
        <Rise at={10}>Paid per call.</Rise> <Rise at={16}>In USDC.</Rise> <Rise at={22}>On Arc.</Rise>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 5. kinetic slam */

const S5Slam: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const v = useVertical();
  const beat = BAR / 4;
  const words = [
    { t: "NO", rot: -6, col: "#fff" },
    { t: "API KEYS.", rot: 4, col: G },
    { t: "NO", rot: 5, col: "#fff" },
    { t: "HUMANS.", rot: -4, col: LIME },
  ];
  const i = Math.min(3, Math.floor(frame / beat));
  const local = frame - i * beat;
  const p = interpolate(local, [0, 8], [0, 1], { ...clamp, easing: ease });
  const w = words[i];
  const dir = i % 2 ? -1 : 1;
  const barP = (k: number) => interpolate(local, [k * 2, k * 2 + 10], [-1.2, 1.2], { ...clamp, easing: easeIn });
  return (
    <AbsoluteFill style={{ background: "#060606", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {/* sweeping bars behind each word */}
      {[0, 1, 2].map((k) => (
        <div key={k} style={{ position: "absolute", left: 0, top: `${30 + k * 16}%`, width: "100%", height: v ? 60 : 50, background: k === 1 ? G : "#1b1b1b", opacity: k === 1 ? 0.35 : 1, transform: `translateX(${barP(k) * width * dir}px) skewX(-20deg)` }} />
      ))}
      {/* previous word, sliding out */}
      {i > 0 && local < 8 && (
        <div style={{ position: "absolute", fontFamily: F.display, fontWeight: 700, fontSize: v ? 190 : 260, letterSpacing: -8, color: words[i - 1].col, transform: `translateX(${-p * dir * width * 0.7}px) rotate(${words[i - 1].rot}deg)`, opacity: 1 - p }}>
          {words[i - 1].t}
        </div>
      )}
      <div style={{ position: "absolute", overflow: "hidden", padding: "0 20px" }}>
        <div
          style={{
            fontFamily: F.display,
            fontWeight: 700,
            fontSize: v ? 190 : 260,
            letterSpacing: -8,
            lineHeight: 1,
            color: w.col,
            whiteSpace: "nowrap",
            transform: `translateY(${(1 - p) * 110 * dir}%) rotate(${w.rot * p}deg) scale(${1 + (1 - p) * 0.3})`,
          }}
        >
          {w.t}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: v ? "18%" : "12%", fontFamily: F.mono, fontSize: v ? 28 : 26, letterSpacing: 8, color: "#6b7280" }}>AGENTS PAY THEIR OWN WAY</div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 6. particle swarm → the Arc */

const S6Swarm: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const v = useVertical();
  const settle = interpolate(frame, [6, 40], [0, 1], { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) });
  const cx = width / 2;
  const cy = v ? height * 0.58 : height * 0.82;
  const R = v ? width * 0.4 : height * 0.55;
  const text = interpolate(frame, [30, 44], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 100%, #06231a 0%, #020605 60%)" }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        {Array.from({ length: N.arc }, (_, i) => {
          const fuci = i % Math.floor(N.arc / N.fuci) === 0 && i / Math.floor(N.arc / N.fuci) < N.fuci;
          // start: a spinning galaxy
          const sa = rnd(i) * Math.PI * 2 + frame * 0.05 * (0.5 + rnd(i + 1));
          const sr = (0.15 + rnd(i + 2) * 0.5) * Math.min(width, height);
          const sx = cx + Math.cos(sa) * sr;
          const sy = height / 2 + Math.sin(sa) * sr * 0.7;
          // end: on the arc
          const ea = Math.PI + (i / N.arc) * Math.PI;
          const er = R + (rnd(i + 3) - 0.5) * 50;
          const ex = cx + Math.cos(ea) * er;
          const ey = cy + Math.sin(ea) * er;
          const d = Math.min(1, Math.max(0, settle * 1.3 - rnd(i + 4) * 0.3));
          const x = sx + (ex - sx) * d;
          const y = sy + (ey - sy) * d;
          return <circle key={i} cx={x} cy={y} r={fuci ? 8 : 3 + rnd(i + 5) * 2} fill={fuci ? G : "#e5f5ec"} opacity={fuci ? 1 : 0.75} />;
        })}
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: v ? height * 0.66 : height * 0.36, textAlign: "center", opacity: text, transform: `translateY(${(1 - text) * 30}px)` }}>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 120 : 130, letterSpacing: -5, color: "#fff" }}>
          <span style={{ color: G }}>{N.fuci}</span> born on Fuci
        </div>
        <div style={{ fontFamily: F.mono, fontSize: v ? 28 : 26, letterSpacing: 6, color: "#86efac" }}>AND THE ARC IS STILL EARLY</div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 7. split panels */

const S7Panels: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const v = useVertical();
  const panels = [
    { n: N.apis, pre: "", post: "", label: "paid APIs on Fuci Market", bg: "#0b1a12", col: G },
    { n: N.calls, pre: "", post: "", label: "x402 calls paid in USDC", bg: "#0a1320", col: CYAN },
    { n: 1, pre: "$", post: "", label: "to spawn an agent", bg: "#1a1a0a", col: LIME },
    { n: 1, pre: "", post: " yr", label: "dev bag locked", bg: "#1a0f14", col: "#f472b6" },
  ];
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {panels.map((p, i) => {
        const col = v ? 0 : i % 2;
        const row = v ? i : Math.floor(i / 2);
        const w = v ? width : width / 2;
        const h = v ? height / 4 : height / 2;
        const inP = interpolate(frame, [i * 4, i * 4 + 16], [0, 1], { ...clamp, easing: ease });
        const from = [
          [-1, 0],
          [0, -1],
          [0, 1],
          [1, 0],
        ][i];
        const count = Math.round(interpolate(frame, [i * 4 + 6, i * 4 + 30], [0, p.n], { ...clamp, easing: ease }));
        return (
          <div key={i} style={{ position: "absolute", left: col * w, top: row * h, width: w, height: h, padding: 6, transform: `translate(${(1 - inP) * from[0] * w}px, ${(1 - inP) * from[1] * h}px)` }}>
            <div style={{ width: "100%", height: "100%", borderRadius: 24, background: p.bg, border: `1px solid ${p.col}33`, display: "flex", flexDirection: "column", justifyContent: "center", padding: v ? "0 60px" : "0 70px", overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", right: -40, top: -40, width: 240, height: 240, borderRadius: "50%", border: `2px solid ${p.col}44`, transform: `scale(${1 + frame * 0.01})` }} />
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 130 : 150, letterSpacing: -6, color: p.col, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {p.pre}
                {count}
                {p.post}
              </div>
              <div style={{ fontFamily: F.body, fontSize: v ? 34 : 34, color: "#e5e7eb", marginTop: 8 }}>{p.label}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 8. resolve */

const S8End: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useVertical();
  const logo = spring({ frame: frame - 2, fps, config: { damping: 12 } });
  const burst = interpolate(frame, [2, 30], [0, 1], { ...clamp, easing: ease });
  const text = interpolate(frame, [12, 28], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, #07170e 0%, #000 65%)", alignItems: "center", justifyContent: "center" }}>
      <svg width={1400} height={1400} style={{ position: "absolute" }}>
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          const r0 = 150 + burst * 180;
          const r1 = r0 + 60 + (i % 3) * 40 * (1 - burst);
          return <line key={i} x1={700 + Math.cos(a) * r0} y1={700 + Math.sin(a) * r0} x2={700 + Math.cos(a) * r1} y2={700 + Math.sin(a) * r1} stroke={i % 2 ? G : "#fff"} strokeWidth={4} strokeLinecap="round" opacity={(1 - burst) * 0.9} />;
        })}
        <circle cx={700} cy={700} r={180 + burst * 260} fill="none" stroke={G} strokeWidth={2} opacity={(1 - burst) * 0.6} />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 26 : 22 }}>
        <div style={{ transform: `scale(${logo}) rotate(${(1 - logo) * -90}deg)` }}>
          <Frond size={v ? 170 : 150} draw={false} />
        </div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 110 : 120, letterSpacing: -4, color: "#fff", lineHeight: 1, textAlign: "center" }}>
          <Rise at={10}>Spawn your agent</Rise>
          <br />
          <Rise at={14}>
            for <span style={{ color: G }}>$1</span>.
          </Rise>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: v ? 38 : 36, color: G, letterSpacing: 3, opacity: text, transform: `translateY(${(1 - text) * 16}px)` }}>fuci.family · $FUCI</div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ the reel */

const SCENES: [React.FC, WipeKind][] = [
  [S1Logo, "circle"],
  [S2Morph, "circle"],
  [S3Grid, "diagonal"],
  [S4Flow, "blinds"],
  [S5Slam, "push"],
  [S6Swarm, "split"],
  [S7Panels, "iris"],
  [S8End, "circle"],
];

/**
 * 15 s: "Motion reel". Eight scenes, one bar of 128 BPM each, every one a different technique:
 * mask-rise type, polar shape morph, 3D tile-flip wave, path-following packets, kinetic word slams,
 * a particle swarm that settles into the Arc, split-panel counters, and a line-burst logo resolve.
 * No flashes: every change is a moving mask or shape. Sound: public/reel.wav from scripts/reel.py.
 */
export const Reel: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const v = useVertical();
  const tc = (f: number) => `00:00:${String(Math.floor(f / 30)).padStart(2, "0")}:${String(f % 30).padStart(2, "0")}`;
  const scene = CUTS.findIndex((c, i) => frame >= c && frame < (CUTS[i + 1] ?? 1e9));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {SCENES.map(([S, wipe], i) => (
        <Sequence key={i} from={CUTS[i]} durationInFrames={CUTS[i + 1] - CUTS[i] + (i < SCENES.length - 1 ? 14 : 0)}>
          {i === 0 ? <S /> : <Wipe kind={wipe}><S /></Wipe>}
        </Sequence>
      ))}
      {/* Reel HUD */}
      <div style={{ position: "absolute", left: v ? 40 : 50, top: v ? 50 : 36, fontFamily: F.mono, fontSize: v ? 20 : 18, letterSpacing: 4, color: "rgba(255,255,255,0.55)" }}>
        FUCI / MOTION REEL — {String(scene + 1).padStart(2, "0")}/08
      </div>
      <div style={{ position: "absolute", right: v ? 40 : 50, top: v ? 50 : 36, fontFamily: F.mono, fontSize: v ? 20 : 18, letterSpacing: 2, color: "rgba(255,255,255,0.55)" }}>{tc(frame)}</div>
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 5, width: (frame / 450) * width, background: `linear-gradient(90deg, ${G}, ${LIME})` }} />
      {height < 0 && null}
    </AbsoluteFill>
  );
};
