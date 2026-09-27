import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, useVertical } from "../theme";

/**
 * 15 s: "$FUCI is on CoinGecko". A search bar finds FUCI, the result becomes a spinning coin, the coin's
 * facts slide in, then the trail of listings (Argus → DexScreener → DefiLlama → CoinGecko) and an end card.
 * No prices or market caps: they go stale within hours. Timed to public/gecko.wav (scripts/gecko.py).
 * CoinGecko logos are the unaltered files from CoinGecko's brand kit (brand.coingecko.com → Brand Kit →
 * "CG-GT Logos.zip": CG/CG-Symbol.svg and CG/CG-Lockup.svg), copied to public/coingecko/ (not committed).
 */
export const T = { search: 0, typeStart: 14, pick: 78, coin: 104, sheet: 222, trail: 318, end: 400, dur: 450 };
export const ROW_AT = (i: number) => T.sheet + 24 + i * 14;
export const CHIP_AT = (i: number) => T.trail + 10 + i * 10;

const G = "#8dc63f"; // gecko green
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const QUERY = "fuci";
const CG_SYMBOL = staticFile("coingecko/symbol.svg");
const CG_LOCKUP = staticFile("coingecko/lockup.svg"); // white wordmark, for dark backgrounds

const FrondMark: React.FC<{ size: number; color?: string }> = ({ size, color = "#fff" }) => (
  <svg viewBox="0 0 64 64" width={size} height={size}>
    <g fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round">
      <path d="M32 60V38" />
      <path d="M32 38c0-6-8-9-9-17" />
      <path d="M32 38c0-6 8-9 9-17" />
      <path d="M23 21c-1-5-5-7-6-11" />
      <path d="M23 21c1-5 4-7 5-11" />
      <path d="M41 21c-1-5-4-7-5-11" />
      <path d="M41 21c1-5 5-7 6-11" />
    </g>
    <g fill={color}>
      {[17, 28, 36, 47].map((x) => (
        <circle key={x} cx={x} cy={9} r={3.2} />
      ))}
    </g>
  </svg>
);

/** Soft green glow and a slow grid, the whole time. */
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.4) % 80;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(1100px 700px at 50% 45%, #0f1d0b 0%, #050805 55%, #000 100%)" }}>
      <AbsoluteFill
        style={{
          opacity: 0.35,
          backgroundImage: `linear-gradient(rgba(141,198,63,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(141,198,63,.07) 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          backgroundPosition: `0 ${drift}px`,
          maskImage: "radial-gradient(ellipse at center, #000 30%, transparent 75%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** 1. Search: "fuci" is typed and the FUCI result is picked. */
const Search: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inA = spring({ frame: frame - 2, fps, config: { damping: 18 } });
  const out = interpolate(frame, [T.coin - 6, T.coin + 8], [1, 0], clamp);
  const typed = QUERY.slice(0, Math.floor(interpolate(frame, [T.typeStart, T.typeStart + 34], [0, QUERY.length], clamp)));
  const drop = spring({ frame: frame - (T.typeStart + 40), fps, config: { damping: 16 } });
  const picked = frame >= T.pick;
  const press = interpolate(frame, [T.pick, T.pick + 4, T.pick + 12], [1, 0.97, 1], clamp);
  const w = v ? 940 : 1240;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ width: w, transform: `translateY(${(1 - inA) * 40 - 20}px)`, opacity: inA }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 24 }}>
          <Img src={CG_LOCKUP} style={{ height: 50 }} />
          <span style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: 6, color: C.muted }}>SEARCH</span>
        </div>
        <div style={{ height: 124, borderRadius: 24, background: "#0d130b", border: `2px solid ${G}66`, display: "flex", alignItems: "center", padding: "0 34px", gap: 22, boxShadow: `0 0 60px ${G}22` }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#9aa39e" strokeWidth={2.2} strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <div style={{ fontFamily: F.display, fontSize: 64, fontWeight: 600, color: C.ink }}>
            {typed}
            <span style={{ opacity: frame % 30 < 16 && frame < T.pick ? 1 : 0, color: G }}>|</span>
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            borderRadius: 22,
            background: "#0d130b",
            border: "1px solid #24331d",
            overflow: "hidden",
            opacity: drop,
            transform: `translateY(${(1 - drop) * -16}px) scale(${press})`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "26px 34px", background: picked ? `${G}26` : "transparent" }}>
            <div style={{ width: 72, height: 72, borderRadius: 36, background: "#000", border: "2px solid #2d3a27", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FrondMark size={46} />
            </div>
            <div style={{ fontFamily: F.display, fontSize: 54, fontWeight: 700, color: C.ink }}>Fuci</div>
            <div style={{ fontFamily: F.mono, fontSize: 36, color: C.ink2 }}>FUCI</div>
            <div style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 22, color: G, border: `1px solid ${G}66`, borderRadius: 999, padding: "8px 16px" }}>Arc</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The coin: spins in, settles, then slides aside for the facts. */
const Coin: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (frame < T.coin - 4 || frame >= T.end + 12) return null;
  const pop = spring({ frame: frame - T.coin, fps, config: { damping: 14, mass: 0.9 } });
  // Four full turns that slow to a stop, logo facing forward.
  const turn = interpolate(frame, [T.coin, T.coin + 96], [0, 8 * Math.PI], { ...clamp, easing: Easing.out(Easing.cubic) });
  const c = Math.cos(turn);
  const aside = interpolate(frame, [T.sheet - 6, T.sheet + 22], [0, 1], { ...clamp, easing: ease });
  const shrink = interpolate(frame, [T.trail - 8, T.trail + 18], [1, 0.62], { ...clamp, easing: ease });
  const gone = interpolate(frame, [T.end - 8, T.end + 10], [1, 0], clamp);
  const size = (v ? 520 : 500) * pop * (1 - 0.28 * aside) * shrink;
  const cx = v ? width / 2 : interpolate(aside, [0, 1], [width / 2, width * 0.27]);
  const cy = v ? interpolate(aside, [0, 1], [height * 0.42, height * 0.22]) : height / 2 - (1 - shrink) * 120;
  const face = c >= 0;
  const bob = Math.sin(frame / 18) * 6 * aside;
  return (
    <div style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2 + bob, width: size, height: size, opacity: gone }}>
      <div style={{ position: "absolute", inset: -size * 0.25, borderRadius: "50%", background: `radial-gradient(circle, ${G}40 0%, transparent 62%)` }} />
      {/* edge */}
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#2d4a1c", transform: `scaleX(${Math.max(0.06, Math.abs(c))}) translateX(${Math.sign(c || 1) * 6}px)` }} />
      {/* face */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          transform: `scaleX(${Math.max(0.04, Math.abs(c))})`,
          background: face ? "radial-gradient(circle at 35% 30%, #1b1b1b, #000 70%)" : `radial-gradient(circle at 35% 30%, #b5e36b, ${G} 55%, #5c8a24)`,
          border: `${Math.max(4, size * 0.028)}px solid ${face ? G : "#d9f2ad"}`,
          boxShadow: `inset 0 0 ${size * 0.08}px rgba(255,255,255,.12), 0 ${size * 0.06}px ${size * 0.18}px rgba(0,0,0,.6)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {face ? (
          <FrondMark size={size * 0.56} />
        ) : (
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: size * 0.2, color: "#0b1406", letterSpacing: -2 }}>FUCI</div>
        )}
      </div>
    </div>
  );
};

/** 2. Headline under the coin, while it spins. */
const Headline: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const a = spring({ frame: frame - (T.coin + 40), fps, config: { damping: 18 } });
  const out = interpolate(frame, [T.sheet - 12, T.sheet + 4], [1, 0], clamp);
  if (frame < T.coin + 30 || frame > T.sheet + 6) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: v ? height * 0.64 : height / 2 + 290, textAlign: "center", opacity: a * out, transform: `translateY(${(1 - a) * 24}px)` }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 24 }}>
        <span style={{ fontFamily: F.mono, fontSize: v ? 32 : 30, letterSpacing: 9, color: G }}>NOW TRACKED ON</span>
        <Img src={CG_LOCKUP} style={{ height: v ? 60 : 58 }} />
      </div>
    </div>
  );
};

const ROWS: [string, string][] = [
  ["Name", "Fuci · FUCI"],
  ["Chain", "Arc"],
  ["Contract", "0xe66d…4420"],
  ["Total supply", "1,000,000,000"],
  ["Buy / sell tax", "1% / 1%"],
  ["Launched on", "Argus"],
];

/** 3. The coin's facts, one row at a time. */
const Sheet: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (frame < T.sheet || frame > T.end + 10) return null;
  const out = interpolate(frame, [T.trail - 10, T.trail + 6], [1, 0], clamp);
  const title = spring({ frame: frame - (T.sheet + 6), fps, config: { damping: 18 } });
  const w = v ? width - 140 : 900;
  const left = v ? 70 : width * 0.45;
  const top = v ? height * 0.37 : height / 2 - 380;
  return (
    <div style={{ position: "absolute", left, top, width: w, opacity: out }}>
      <div style={{ opacity: title, transform: `translateY(${(1 - title) * 20}px)` }}>
        <div style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: 7, color: G }}>COINGECKO · COIN PAGE</div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 96 : 100, letterSpacing: -3, color: C.ink, marginTop: 10 }}>$FUCI</div>
      </div>
      <div style={{ marginTop: 20, borderTop: "1px solid #24331d" }}>
        {ROWS.map(([k, val], i) => {
          const a = spring({ frame: frame - ROW_AT(i), fps, config: { damping: 18 } });
          return (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: v ? "24px 0" : "20px 0",
                borderBottom: "1px solid #1a2615",
                opacity: a,
                transform: `translateX(${(1 - a) * 60}px)`,
              }}
            >
              <span style={{ fontFamily: F.body, fontSize: v ? 38 : 38, color: C.ink2 }}>{k}</span>
              <span style={{ fontFamily: F.mono, fontSize: v ? 38 : 38, color: C.ink }}>{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TRAIL = ["Argus", "DexScreener", "DefiLlama", "CoinGecko"];

/** 4. Where $FUCI is listed, in order; CoinGecko lands last. */
const Trail: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (frame < T.trail - 4 || frame > T.end + 10) return null;
  const out = interpolate(frame, [T.end - 8, T.end + 6], [1, 0], clamp);
  const head = spring({ frame: frame - T.trail, fps, config: { damping: 18 } });
  const left = v ? 70 : width * 0.45;
  const top = v ? height * 0.4 : height / 2 - 330;
  return (
    <div style={{ position: "absolute", left, top, right: v ? 70 : 110, opacity: out }}>
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 84 : 92, letterSpacing: -3, color: C.ink, lineHeight: 1.05, opacity: head, transform: `translateY(${(1 - head) * 20}px)` }}>
        Find $FUCI on
      </div>
      <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 16 }}>
        {TRAIL.map((name, i) => {
          const a = spring({ frame: frame - CHIP_AT(i), fps, config: { damping: 14 } });
          const last = i === TRAIL.length - 1;
          return (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                padding: "22px 30px",
                borderRadius: 18,
                border: `2px solid ${last ? G : "#24331d"}`,
                background: last ? `${G}1f` : "#0b100a",
                boxShadow: last ? `0 0 ${40 * a}px ${G}44` : "none",
                opacity: a,
                transform: `translateX(${(1 - a) * 80}px) scale(${last ? 0.94 + 0.06 * a : 1})`,
              }}
            >
              <svg width="42" height="42" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="10" fill={last ? G : "#2e4523"} />
                <path d="M5.5 10.3l3 3 6-6.3" stroke={last ? "#0b1406" : G} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {last && <Img src={CG_SYMBOL} style={{ height: v ? 52 : 54, width: v ? 52 : 54 }} />}
              <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: v ? 50 : 52, color: C.ink }}>{name}</span>
              {last && <span style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 26, letterSpacing: 5, color: G }}>NEW</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** 5. End card. */
const End: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < T.end - 4) return null;
  const a = spring({ frame: frame - T.end, fps, config: { damping: 18 } });
  const b = spring({ frame: frame - (T.end + 16), fps, config: { damping: 18 } });
  const fade = interpolate(frame, [T.dur - 14, T.dur - 1], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fade, textAlign: "center", padding: "0 80px" }}>
      <div style={{ transform: `scale(${0.9 + 0.1 * a})`, opacity: a, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
        <div style={{ width: 150, height: 150, borderRadius: 75, background: "#000", border: `4px solid ${G}`, boxShadow: `0 0 60px ${G}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FrondMark size={92} />
        </div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 96 : 120, letterSpacing: -4, lineHeight: 1.02, color: C.ink }}>
          $FUCI is on <span style={{ color: G }}>CoinGecko</span>.
        </div>
      </div>
      <div style={{ marginTop: 34, opacity: b, transform: `translateY(${(1 - b) * 16}px)` }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 18 }}>
          <Img src={CG_SYMBOL} style={{ height: v ? 48 : 54, width: v ? 48 : 54 }} />
          <span style={{ fontFamily: F.mono, fontSize: v ? 38 : 44, color: C.ink }}>coingecko.com/en/coins/fuci</span>
        </div>
        <div style={{ fontFamily: F.body, fontSize: v ? 32 : 34, color: C.ink2, marginTop: 16 }}>AI agents that pay their own way on Arc · fuci.family</div>
      </div>
    </AbsoluteFill>
  );
};

export const Gecko: React.FC = () => {
  const v = useVertical();
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Backdrop />
      <Search v={v} />
      <Coin v={v} />
      <Headline v={v} />
      <Sheet v={v} />
      <Trail v={v} />
      <End v={v} />
    </AbsoluteFill>
  );
};
