import React from "react";
import { AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { loadFont } from "@remotion/fonts";

// Same palette and type as www.fuci.family (dark theme). Fonts are bundled in public/fonts.
const FONTS: [string, string, string[]][] = [
  ["Space Grotesk", "space-grotesk", ["500", "600", "700"]],
  ["Inter", "inter", ["400", "500", "600"]],
  ["JetBrains Mono", "jetbrains-mono", ["400", "500"]],
];
for (const [family, file, weights] of FONTS) {
  for (const weight of weights) void loadFont({ family, url: staticFile(`fonts/${file}-latin-${weight}-normal.woff2`), weight });
}

export const C = {
  bg: "#000000",
  surface: "#111111",
  surface2: "#161616",
  ink: "#ffffff",
  ink2: "#b3b3b3",
  muted: "#7a7a7a",
  line: "#262626",
  up: "#22c55e",
  down: "#ef4444",
};

export const F = {
  display: "'Space Grotesk', sans-serif",
  body: "Inter, sans-serif",
  mono: "'JetBrains Mono', monospace",
};


/** Portrait renders stack panels under the captions. */
export const useVertical = () => {
  const { width, height } = useVideoConfig();
  return height > width;
};

/** 0→1 spring starting at `delay` frames. */
export const useIn = (delay = 0, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};

/** Fade a whole scene in at the start and out at the end. */
export const SceneFade: React.FC<{ children: React.ReactNode; duration: number }> = ({ children, duration }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, duration - 10, duration], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, duration], [1, 1.03]);
  return <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>{children}</AbsoluteFill>;
};

/** Slow concentric rings, like the site's hero background. */
export const Rings: React.FC<{ x?: string; y?: string; opacity?: number }> = ({ x = "70%", y = "45%", opacity = 1 }) => {
  const frame = useCurrentFrame();
  const rings = Array.from({ length: 9 }, (_, i) => i);
  return (
    <AbsoluteFill style={{ opacity }}>
      {rings.map((i) => {
        const r = ((i * 160 + frame * 1.2) % 1440) + 40;
        const o = interpolate(r, [40, 400, 1480], [0, 0.14, 0]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: r * 2,
              height: r * 2,
              marginLeft: -r,
              marginTop: -r,
              borderRadius: "50%",
              border: `1.5px solid rgba(255,255,255,${o})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Floating bubbles rising from the bottom (the "kelp forest"). */
export const Bubbles: React.FC<{ count?: number }> = ({ count = 26 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill>
      {Array.from({ length: count }, (_, i) => {
        const seed = Math.sin(i * 91.7) * 10000;
        const rnd = seed - Math.floor(seed);
        const speed = 0.6 + rnd * 1.4;
        const size = 3 + rnd * 7;
        const x = ((i * 137) % 100) / 100 * width + Math.sin((frame + i * 20) / 30) * 12;
        const y = height + 40 - ((frame * speed + i * 97) % (height + 80));
        return (
          <div
            key={i}
            style={{ position: "absolute", left: x, top: y, width: size, height: size, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const PATHS = ["M32 58V38", "M32 38c0-6-8-9-9-17", "M32 38c0-6 8-9 9-17", "M23 21c-1-5-5-7-6-11", "M23 21c1-5 4-7 5-11", "M41 21c-1-5-4-7-5-11", "M41 21c1-5 5-7 6-11"];
const TIPS: [number, number][] = [
  [17, 9],
  [28, 9],
  [36, 9],
  [47, 9],
];

/** The Fuci frond, drawn stroke by stroke from `delay`. */
export const Frond: React.FC<{ size: number; delay?: number; draw?: boolean }> = ({ size, delay = 0, draw = true }) => {
  const frame = useCurrentFrame();
  const t = (start: number, len: number) =>
    draw ? interpolate(frame - delay, [start, start + len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) : 1;
  const order = [0, 1, 1, 2, 2, 2, 2];
  return (
    <svg width={size} height={size} viewBox="4 2 56 60">
      <g fill="none" stroke={C.ink} strokeWidth={4} strokeLinecap="round">
        {PATHS.map((d, i) => {
          const p = t(order[i] * 10, 16);
          return <path key={d} d={d} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} opacity={p > 0 ? 1 : 0} />;
        })}
      </g>
      {TIPS.map(([cx, cy], i) => {
        const p = t(34 + i * 3, 10);
        return <circle key={cx} cx={cx} cy={cy} r={3 * p} fill={C.ink} />;
      })}
    </svg>
  );
};

export const Eyebrow: React.FC<{ children: React.ReactNode; live?: boolean; style?: React.CSSProperties }> = ({ children, live, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: F.mono, fontSize: 22, letterSpacing: 5, textTransform: "uppercase", color: C.muted, ...style }}>
      {live && (
        <span
          style={{ width: 12, height: 12, borderRadius: 6, background: C.up, boxShadow: `0 0 ${10 + 8 * Math.sin(frame / 6)}px ${C.up}` }}
        />
      )}
      {children}
    </div>
  );
};

/** Text typed out character by character. */
export const Typed: React.FC<{ text: string; start: number; cps?: number; caret?: boolean }> = ({ text, start, cps = 22, caret = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(0, Math.min(text.length, Math.floor(((frame - start) / fps) * cps)));
  const typing = frame >= start && n < text.length;
  const blink = Math.floor(frame / 15) % 2 === 0;
  return (
    <>
      {text.slice(0, n)}
      {caret && (typing || (frame >= start && blink)) && <span style={{ opacity: 0.8 }}>▍</span>}
    </>
  );
};
export const typedEnd = (text: string, start: number, fps: number, cps = 22) => start + Math.ceil((text.length / cps) * fps);

/** A browser-like window, as on fuci.family. */
export const Window: React.FC<{ url: string; children: React.ReactNode; width: number; style?: React.CSSProperties }> = ({ url, children, width, style }) => (
  <div
    style={{
      width,
      background: C.surface,
      border: `1.5px solid ${C.line}`,
      borderRadius: 22,
      overflow: "hidden",
      boxShadow: "0 40px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03)",
      ...style,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", borderBottom: `1.5px solid ${C.line}`, background: "#0b0b0b" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 13, height: 13, borderRadius: 7, background: "#2a2a2a" }} />
      ))}
      <div style={{ marginLeft: 16, flex: 1, padding: "8px 16px", borderRadius: 10, background: "#151515", fontFamily: F.mono, fontSize: 19, color: C.muted }}>
        <span style={{ color: C.up }}>●</span> {url}
      </div>
    </div>
    <div style={{ padding: 34 }}>{children}</div>
  </div>
);

/** Numbered chapter caption on the left (top in portrait). */
export const Caption: React.FC<{ n: string; title: string; sub: string }> = ({ n, title, sub }) => {
  const a = useIn(0);
  const b = useIn(6);
  const c = useIn(12);
  const vertical = useVertical();
  return (
    <div style={{ maxWidth: vertical ? 900 : 640 }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>
        <Eyebrow>{n}</Eyebrow>
      </div>
      <div
        style={{
          marginTop: 22,
          fontFamily: F.display,
          fontWeight: 700,
          fontSize: vertical ? 92 : 84,
          lineHeight: 1.02,
          letterSpacing: -2,
          color: C.ink,
          opacity: b,
          transform: `translateY(${(1 - b) * 30}px)`,
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 26, fontFamily: F.body, fontSize: vertical ? 38 : 32, lineHeight: 1.4, color: C.ink2, opacity: c, transform: `translateY(${(1 - c) * 20}px)` }}>
        {sub}
      </div>
    </div>
  );
};

/** Caption + panel, side by side in landscape and stacked in portrait. */
export const Split: React.FC<{ caption: React.ReactNode; children: React.ReactNode }> = ({ caption, children }) => {
  const vertical = useVertical();
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: vertical ? "flex-start" : "center",
        justifyContent: vertical ? "center" : "space-between",
        padding: vertical ? "0 80px" : "0 130px",
        gap: vertical ? 70 : 60,
      }}
    >
      <div style={{ flex: vertical ? undefined : "0 0 640px" }}>{caption}</div>
      <div style={{ display: "flex", justifyContent: "center", width: vertical ? "100%" : undefined }}>{children}</div>
    </AbsoluteFill>
  );
};

export const Pill: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 20px",
      borderRadius: 999,
      border: `1.5px solid ${C.line}`,
      background: C.surface2,
      fontFamily: F.mono,
      fontSize: 20,
      color: C.ink2,
      ...style,
    }}
  >
    {children}
  </span>
);
