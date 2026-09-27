import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Frond, useVertical } from "../theme";

/** Every ERC-8004 agent on Arc when this clip was made (fuci.family/api/stats/public). */
export const AGENTS = 225;
/** Of those, created through the Fuci factory. */
const FUCI = 7;

/** Frame timings, shared with scripts/census.py so the sound lands on the picture. */
export const T = {
  open: 8, // "Every chain has a first night."
  openOut: 66,
  stars: [74, 196] as const, // stars ignite, the counter runs
  count: 206, // "225 AI agents. That's all of them."
  small: 256, // "Not 225 thousand."
  settlers: 300, // "The first ones get the names…"
  slot: 318, // the empty star #226
  cta: 372,
};

const GREEN = "#22c55e";
const rnd = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** When star i lights: slow at first, then a rush (like a city at dusk). */
const igniteAt = (i: number) => T.stars[0] + (T.stars[1] - T.stars[0]) * Math.pow(i / AGENTS, 0.55);

/**
 * 15 s: "The First Night". Every agent on Arc is a star; together they draw the Arc. Only 225 so far,
 * and star #226 is still empty. Sound: public/census.wav from scripts/census.py.
 */
export const Census: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const v = useVertical();

  // The arc: an upper half-ring of stars.
  const cx = width / 2;
  const cy = v ? height * 0.56 : height * 0.95;
  const r = v ? width * 0.42 : height * 0.56;
  const band = v ? 70 : 60;
  const fuciIdx = new Set(Array.from({ length: FUCI }, (_, k) => Math.floor((k + 0.5) * (AGENTS / FUCI))));
  const stars = Array.from({ length: AGENTS }, (_, i) => {
    const a = Math.PI + (Math.PI * (i + rnd(i) * 0.9)) / AGENTS; // left → right over the top
    const rr = r + (rnd(i + 500) - 0.5) * band * 2;
    return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, at: igniteAt(i), size: 2.2 + rnd(i + 900) * 3.2, fuci: fuciIdx.has(i) };
  });
  const lit = stars.filter((s) => frame >= s.at).length;
  // Inside the arc, beside the counter: where the next agent will appear.
  const slot = { x: cx + r * (v ? 0.5 : 0.62), y: cy - r * (v ? 0.62 : 0.52) };

  const line = (at: number, out: number) => interpolate(frame, [at, at + 12, out - 10, out], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeScene = interpolate(frame, [T.cta - 10, T.cta + 4], [1, 0.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const counterIn = interpolate(frame, [T.stars[0], T.stars[0] + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const slotIn = spring({ frame: frame - T.slot, fps, config: { damping: 14 } });
  const cta = spring({ frame: frame - T.cta, fps, config: { damping: 15 } });

  const Text: React.FC<{ at: number; out: number; children: React.ReactNode; size?: number; top?: string | number; weight?: number }> = ({ at, out, children, size = v ? 64 : 64, top = v ? "14%" : "12%", weight = 500 }) => {
    const a = line(at, out);
    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top,
          padding: "0 60px",
          textAlign: "center",
          fontFamily: F.display,
          fontWeight: weight,
          fontSize: size,
          letterSpacing: -1,
          lineHeight: 1.15,
          color: "#f4f1ea",
          opacity: a,
          filter: `blur(${(1 - a) * 8}px)`,
          transform: `translateY(${(1 - a) * 16}px)`,
        }}
      >
        {children}
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 100%, #0b1a2e 0%, #050a14 45%, #020308 100%)", overflow: "hidden" }}>
      {/* Far background stars (not agents) */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 160 }, (_, i) => (
          <circle key={i} cx={rnd(i + 3000) * width} cy={rnd(i + 4000) * height} r={0.6 + rnd(i + 5000)} fill="#fff" opacity={0.12 + 0.18 * (0.5 + 0.5 * Math.sin(frame / 20 + i))} />
        ))}
      </svg>

      <AbsoluteFill style={{ opacity: fadeScene }}>
        {/* The agents: each a star that ignites, the Fuci ones green */}
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id="glow">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="glowG">
              <stop offset="0%" stopColor={GREEN} stopOpacity="0.9" />
              <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
            </radialGradient>
          </defs>
          {stars.map((s, i) => {
            const t = frame - s.at;
            if (t < 0) return null;
            const flash = Math.max(0, 1 - t / 14);
            const twinkle = 0.75 + 0.25 * Math.sin(frame / 9 + i * 1.7);
            const size = s.size * (s.fuci ? 1.5 : 1);
            return (
              <g key={i}>
                <circle cx={s.x} cy={s.y} r={size * (3 + 5 * flash)} fill={`url(#${s.fuci ? "glowG" : "glow"})`} opacity={0.35 * twinkle + 0.5 * flash} />
                <circle cx={s.x} cy={s.y} r={size * 0.6} fill={s.fuci ? GREEN : "#fffaf0"} opacity={twinkle} />
              </g>
            );
          })}
          {/* Star #226: empty, waiting */}
          {frame >= T.slot && (
            <g opacity={slotIn}>
              <circle cx={slot.x} cy={slot.y} r={26 + 4 * Math.sin(frame / 6)} fill="none" stroke={GREEN} strokeWidth={2.5} strokeDasharray="6 7" transform={`rotate(${frame * 1.5} ${slot.x} ${slot.y})`} />
              <circle cx={slot.x} cy={slot.y} r={5} fill="none" stroke={GREEN} strokeWidth={2} opacity={0.5 + 0.5 * Math.sin(frame / 5)} />
            </g>
          )}
        </svg>
        {frame >= T.slot && (
          <div
            style={{
              position: "absolute",
              left: slot.x - (v ? 110 : 100),
              top: slot.y + 40,
              fontFamily: F.mono,
              fontSize: v ? 30 : 28,
              color: GREEN,
              letterSpacing: 2,
              opacity: slotIn,
              whiteSpace: "nowrap",
            }}
          >
            #226 · yours?
          </div>
        )}

        {/* The counter */}
        <div style={{ position: "absolute", left: 0, right: 0, top: v ? "60%" : "58%", textAlign: "center", opacity: counterIn * interpolate(frame, [T.settlers - 10, T.settlers, T.cta - 12, T.cta], [1, 0.5, 0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 200 : 180, lineHeight: 1, color: "#fffaf0", fontVariantNumeric: "tabular-nums", textShadow: "0 0 40px rgba(255,250,240,0.25)" }}>{lit}</div>
          <div style={{ marginTop: 10, fontFamily: F.mono, fontSize: v ? 28 : 26, letterSpacing: 6, color: "#8b95a7" }}>AI AGENTS REGISTERED ON ARC</div>
          <div style={{ marginTop: 12, fontFamily: F.mono, fontSize: v ? 24 : 22, letterSpacing: 3, color: GREEN, opacity: interpolate(frame, [T.stars[1] - 30, T.stars[1]], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            ● {FUCI} born on Fuci
          </div>
        </div>
      </AbsoluteFill>

      {/* The story */}
      <Text at={T.open} out={T.openOut} size={v ? 72 : 72}>
        Every chain has a first night.
      </Text>
      <Text at={T.count} out={T.small}>
        {AGENTS} AI agents live on Arc.
        <br />
        <span style={{ color: "#8b95a7" }}>That&apos;s all of them.</span>
      </Text>
      <Text at={T.small} out={T.settlers}>
        Not {AGENTS} thousand. <span style={{ color: GREEN }}>{AGENTS}.</span>
      </Text>
      <Text at={T.settlers} out={T.cta}>
        The first ones get the names,
        <br />
        the stories and the trust.
      </Text>

      {/* Call to action */}
      {frame >= T.cta && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 26 : 22, opacity: cta, transform: `translateY(${(1 - cta) * 30}px)` }}>
            <Frond size={v ? 110 : 96} draw={false} />
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 104 : 110, letterSpacing: -3, color: "#fffaf0", lineHeight: 1, textAlign: "center" }}>It&apos;s still early.</div>
            <div style={{ fontFamily: F.body, fontSize: v ? 38 : 38, color: "#d6dbe4", textAlign: "center", padding: "0 40px" }}>
              Put your AI agent on Arc for <span style={{ color: GREEN, fontWeight: 600 }}>$1</span>. Be #226.
            </div>
            <div style={{ marginTop: 6, fontFamily: F.mono, fontSize: v ? 34 : 32, color: GREEN, letterSpacing: 2 }}>fuci.family/spawn</div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
