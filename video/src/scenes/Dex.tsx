import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, Bubbles, Frond, useIn, useVertical } from "../theme";

/** Frame timings, shared with scripts/lore.py so the sound lands on the picture. */
export const T = {
  lines: [10, 70, 130, 190, 250],
  lineLen: 58,
  flash: 298,
  card: 306,
  candles: 322, // one candle every 3 frames
  stamp: 384,
  outro: 405,
};

const LORE: React.ReactNode[] = [
  "Beneath the Arc, the tide never stops.",
  <>
    One seaweed took hold. They called it <i style={{ color: "#a3e635" }}>Fucus</i>.
  </>,
  "It grew fronds. Every frond, an AI agent.",
  "They pay their own way in USDC. And the forest keeps growing.",
  "Now the surface can see us.",
];

const TOKEN = "0xe66d5169c5d235209d74e976e594060c44c64420";
const LINK = `dexscreener.com/arc/${TOKEN.slice(0, 6)}…${TOKEN.slice(-4)}`;

const rnd = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** One kelp stalk from the seabed: a swaying spine with alternating blades. */
const Kelp: React.FC<{ x: number; h: number; i: number; grow: number; bottom: number }> = ({ x, h, i, grow, bottom }) => {
  const frame = useCurrentFrame();
  const segs = 10;
  const pts = Array.from({ length: segs + 1 }, (_, k) => {
    const t = k / segs;
    return [x + Math.sin(frame / 38 + k * 0.55 + i * 1.7) * t * 26, bottom - h * grow * t] as const;
  });
  const d = pts.map(([px, py], k) => `${k ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  return (
    <g opacity={Math.min(1, grow * 3)}>
      <path d={d} fill="none" stroke="#3f5f1a" strokeWidth={7} strokeLinecap="round" />
      {pts.slice(1).map(([px, py], k) => {
        const side = k % 2 ? 1 : -1;
        const len = 34 + rnd(i * 7 + k) * 26;
        return (
          <ellipse
            key={k}
            cx={px + side * len * 0.45}
            cy={py}
            rx={len * 0.55}
            ry={9}
            fill={k % 3 ? "#4d7c0f" : "#65a30d"}
            opacity={0.85}
            transform={`rotate(${side * (-28 + Math.sin(frame / 30 + k + i) * 8)} ${px} ${py})`}
          />
        );
      })}
    </g>
  );
};

/**
 * 15 s: a little Fuci lore under the sea, then "$FUCI is listed on DexScreener".
 * No price or market cap on screen: they change by the hour.
 * Sound: public/lore.wav from scripts/lore.py.
 */
export const Dex: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const v = useVertical();

  // ---------- lore ----------
  const lore = interpolate(frame, [T.flash, T.flash + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stalks = v ? 9 : 14;
  const surface = interpolate(frame, [230, T.flash], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = interpolate(frame, [T.flash - 6, T.flash + 2, T.flash + 22], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // ---------- reveal ----------
  const card = spring({ frame: frame - T.card, fps, config: { damping: 15 } });
  const stamp = spring({ frame: frame - T.stamp, fps, config: { damping: 8, stiffness: 170 } });
  const rise = spring({ frame: frame - T.outro, fps, config: { damping: 18 } });
  const outro = useIn(T.outro + 4);
  const cardW = v ? 960 : 1240;
  const chartW = cardW - 80;
  const chartH = v ? 420 : 330;
  const N = 24;
  // A made-up, decorative uptrend (no axis, no numbers): it only needs to look like a chart.
  const closes = Array.from({ length: N + 1 }, (_, i) => 1 + i * 0.16 + Math.sin(i * 1.3) * 0.35 + (rnd(i + 3) - 0.5) * 0.5 + (i > N - 6 ? (i - N + 6) * 0.25 : 0));
  const candles = Array.from({ length: N }, (_, i) => {
    const open = closes[i];
    const close = closes[i + 1];
    return { open, close, hi: Math.max(open, close) + 0.08 + rnd(i + 40) * 0.2, lo: Math.min(open, close) - 0.08 - rnd(i + 80) * 0.2 };
  });
  const maxP = Math.max(...candles.map((c) => c.hi));
  const minP = Math.min(...candles.map((c) => c.lo));
  const y = (p: number) => chartH - 12 - ((p - minP) / (maxP - minP)) * (chartH - 24);
  const cw = chartW / N;

  return (
    <AbsoluteFill style={{ background: "#01060d", overflow: "hidden" }}>
      {/* ===== Lore: the deep ===== */}
      <AbsoluteFill style={{ opacity: lore }}>
        <AbsoluteFill style={{ background: `linear-gradient(180deg, rgb(${8 + 30 * surface},${38 + 50 * surface},${62 + 60 * surface}) 0%, #041526 45%, #01060d 100%)` }} />
        {/* God rays */}
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: -200,
              left: `${8 + i * 17}%`,
              width: 90 + rnd(i) * 120,
              height: height * 1.1,
              background: "linear-gradient(180deg, rgba(180,230,255,0.22), transparent 80%)",
              transform: `skewX(${-18 + Math.sin(frame / 60 + i) * 4}deg)`,
              opacity: (0.35 + 0.35 * Math.sin(frame / 25 + i * 1.3)) * (0.6 + surface),
              filter: "blur(18px)",
            }}
          />
        ))}
        <Bubbles count={v ? 22 : 30} />
        {/* The forest: one stalk first (the holdfast), then more with each line */}
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          {Array.from({ length: stalks }, (_, i) => {
            const first = i === Math.floor(stalks / 2);
            const at = first ? T.lines[1] : T.lines[2] + (rnd(i) * 1.6 + (i % 3) * 0.25) * 60;
            const grow = spring({ frame: frame - at, fps, config: { damping: 40, mass: 3 } });
            const x = first ? width / 2 : ((i + 0.5) / stalks) * width + (rnd(i + 9) - 0.5) * 60;
            const h = (first ? 0.55 : 0.22 + rnd(i + 20) * 0.26) * height;
            return <Kelp key={i} i={i} x={x} h={h} grow={grow} bottom={height + 10} />;
          })}
          {/* Holdfast */}
          <ellipse cx={width / 2} cy={height + 4} rx={70 * useIn(T.lines[1])} ry={26} fill="#2a3d12" />
        </svg>
        {/* Agent tags on some fronds */}
        {[0.22, 0.4, 0.62, 0.8].map((fx, i) => {
          const s = spring({ frame: frame - T.lines[2] - 16 - i * 7, fps, config: { damping: 12 } });
          const fade = interpolate(frame, [T.lines[3] + 40, T.lines[3] + 58], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div
              key={fx}
              style={{
                position: "absolute",
                left: fx * width - 70,
                top: height * (v ? 0.62 : 0.55) + Math.sin(frame / 30 + i) * 10 + (i % 2) * 70,
                padding: "8px 16px",
                borderRadius: 999,
                background: "rgba(1,6,13,0.75)",
                border: "1.5px solid rgba(163,230,53,0.5)",
                fontFamily: F.mono,
                fontSize: v ? 24 : 20,
                color: "#d9f99d",
                opacity: s * fade,
                transform: `scale(${s})`,
                whiteSpace: "nowrap",
              }}
            >
              ◉ agent · wallet · ID
            </div>
          );
        })}
        {/* Lore lines */}
        {LORE.map((line, i) => {
          const at = T.lines[i];
          const a = interpolate(frame, [at, at + 14, at + T.lineLen - 12, at + T.lineLen], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const last = i === LORE.length - 1;
          return (
            <AbsoluteFill key={i} style={{ alignItems: "center", justifyContent: v ? "flex-start" : "center", paddingTop: v ? 380 : 0, pointerEvents: "none" }}>
              <div
                style={{
                  maxWidth: v ? 900 : 1400,
                  marginTop: v ? 0 : -380,
                  textAlign: "center",
                  fontFamily: F.display,
                  fontWeight: last ? 700 : 500,
                  fontSize: v ? 76 : 76,
                  lineHeight: 1.15,
                  letterSpacing: -1.5,
                  color: "#eaf6ff",
                  textShadow: "0 4px 40px rgba(0,0,0,0.8)",
                  opacity: a,
                  filter: `blur(${(1 - a) * 12}px)`,
                  transform: `translateY(${(1 - a) * 24}px)`,
                }}
              >
                {line}
              </div>
            </AbsoluteFill>
          );
        })}
      </AbsoluteFill>

      {/* ===== Reveal: DexScreener ===== */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: frame >= T.flash ? 1 : 0 }}>
        <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 40%, rgba(163,230,53,0.12), transparent 60%)" }} />
        <div
          style={{
            position: "absolute",
            width: cardW,
            borderRadius: 18,
            border: "1.5px solid #262626",
            background: "#0b0b0b",
            boxShadow: "0 30px 90px rgba(0,0,0,0.7)",
            opacity: card,
            transform: `translateY(${(1 - card) * 120 - rise * (v ? 210 : 140)}px) scale(${(0.94 + 0.06 * card) * (1 - rise * (v ? 0.04 : 0.2))})`,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20, padding: v ? "28px 36px" : "26px 40px", borderBottom: "1px solid #1f1f1f" }}>
            <div style={{ width: 72, height: 72, borderRadius: 36, background: "#000", border: "1.5px solid #333", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Frond size={50} draw={false} />
            </div>
            <div>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 52 : 48, color: C.ink, lineHeight: 1 }}>
                FUCI <span style={{ color: C.muted, fontWeight: 500 }}>/ USDC</span>
              </div>
              <div style={{ marginTop: 6, fontFamily: F.body, fontSize: v ? 24 : 22, color: C.ink2 }}>Fuci</div>
            </div>
            <div style={{ flex: 1 }} />
            {!v &&
              ["Arc", "Uniswap v4", "USDC"].map((c) => (
                <span key={c} style={{ padding: "8px 18px", borderRadius: 8, background: "#161616", border: "1px solid #2a2a2a", fontFamily: F.body, fontWeight: 600, fontSize: 22, color: C.ink2 }}>
                  {c}
                </span>
              ))}
          </div>
          {v && (
            <div style={{ display: "flex", gap: 12, padding: "18px 36px 0" }}>
              {["Arc", "Uniswap v4", "USDC"].map((c) => (
                <span key={c} style={{ padding: "8px 18px", borderRadius: 8, background: "#161616", border: "1px solid #2a2a2a", fontFamily: F.body, fontWeight: 600, fontSize: 26, color: C.ink2 }}>
                  {c}
                </span>
              ))}
            </div>
          )}
          <div style={{ position: "relative", padding: "20px 40px 28px" }}>
            <svg width={chartW} height={chartH}>
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1={0} x2={chartW} y1={chartH * g} y2={chartH * g} stroke="#1c1c1c" strokeWidth={1} />
              ))}
              {candles.map((c, i) => {
                const s = interpolate(frame, [T.candles + i * 2.5, T.candles + i * 2.5 + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                if (s <= 0) return null;
                const up = c.close >= c.open;
                const col = up ? "#22c55e" : "#ef4444";
                const cx = i * cw + cw / 2;
                const top = y(Math.max(c.open, c.close));
                const bot = y(Math.min(c.open, c.close));
                const mid = (top + bot) / 2;
                return (
                  <g key={i} opacity={s}>
                    <line x1={cx} x2={cx} y1={y(c.hi)} y2={y(c.lo)} stroke={col} strokeWidth={2} />
                    <rect x={cx - cw * 0.32} width={cw * 0.64} y={mid - (mid - top) * s} height={Math.max(3, (bot - top) * s)} fill={col} rx={2} />
                  </g>
                );
              })}
            </svg>
            {/* Stamp */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) scale(${stamp}) rotate(${-6 + (1 - stamp) * -10}deg)`,
                opacity: Math.min(1, stamp * 1.4),
                padding: v ? "18px 36px" : "16px 40px",
                borderRadius: 14,
                border: "4px solid #a3e635",
                background: "rgba(10,10,10,0.88)",
                color: "#d9f99d",
                fontFamily: F.display,
                fontWeight: 700,
                fontSize: v ? 48 : 64,
                letterSpacing: 4,
                whiteSpace: "nowrap",
                boxShadow: `0 0 ${70 * stamp}px rgba(163,230,53,0.35)`,
              }}
            >
              ✓ LISTED ON DEXSCREENER
            </div>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: v ? 380 : 80,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: outro,
            transform: `translateY(${(1 - outro) * 30}px)`,
          }}
        >
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 80 : 88, letterSpacing: -2, color: C.ink, textAlign: "center", lineHeight: 1.05 }}>
            $FUCI {v ? <br /> : <span style={{ color: "#a3e635" }}>· </span>}the kelp forest of Arc
          </div>
          <div style={{ marginTop: 20, fontFamily: F.mono, fontSize: v ? 30 : 28, color: C.ink2, letterSpacing: 1, textAlign: "center" }}>
            {LINK}
            {v ? <br /> : "  ·  "}
            fuci.family
          </div>
        </div>
      </AbsoluteFill>

      {/* Light breaking the surface */}
      <AbsoluteFill style={{ background: "#e6f7ff", opacity: flash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
