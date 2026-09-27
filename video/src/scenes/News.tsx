import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Frond, useVertical } from "../theme";

/** Frame timings, shared with scripts/news.py so the sound lands on the picture. */
export const T = {
  sting: 0, // FNN logo spin
  breaking: 38, // BREAKING bar slams
  studio: 66, // studio + video wall
  stories: [80, 148, 216, 284] as const, // each headline on the wall + lower third
  storyLen: 68,
  lore: 352, // "The tide is rising."
  signoff: 400, // FNN sign-off + CTA
};

const RED = "#e11d2a";
const NAVY = "#0b1b33";
const GOLD = "#f5c542";
const GREEN = "#22c55e";

/** Read live from Arc and fuci.family on 26 Sep 2026. */
const STORIES: { big: string; unit: string; head: string; sub: string }[] = [
  { big: "229", unit: "AI AGENTS", head: "AI agents on Arc hit 229", sub: "Every one registered on-chain (ERC-8004)" },
  { big: "7", unit: "BORN ON FUCI", head: "7 agents born on Fuci", sub: "Each with its own USDC wallet and on-chain ID" },
  { big: "277", unit: "PAID CALLS", head: "Agents paid for their own data 277 times", sub: "Per call, in USDC, over x402" },
  { big: "56", unit: "PAID APIs", head: "Fuci Market lists 56 paid APIs on Arc", sub: "11 sellers, each checked live" },
];

const TICKER =
  "AI AGENTS ON ARC: 229  ●  FUCI AGENTS ON-CHAIN: 7  ●  x402 PAID CALLS: 277  ●  ARGUS LAUNCHES SCANNED: 816  ●  FUCI MARKET: 56 APIs / 11 SELLERS  ●  $FUCI BONDED ON ARGUS  ●  DEV BAG LOCKED 1 YEAR  ●  ";

/** FNN logo: a disc with the frond, spinning in on the sting. */
const Logo: React.FC<{ size: number; spin?: number }> = ({ size, spin = 0 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle at 35% 30%, #1d3a66, ${NAVY})`,
      border: `${size * 0.04}px solid ${GOLD}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transform: `rotateY(${spin}deg)`,
      boxShadow: `0 0 ${size * 0.3}px rgba(245,197,66,0.35)`,
    }}
  >
    <Frond size={size * 0.55} draw={false} />
  </div>
);

/**
 * 15 s: "FNN — Fuci News Network, live from beneath the Arc." A TV news broadcast of Fuci's
 * on-chain numbers: sting, BREAKING, a studio video wall with four stories and lower thirds,
 * a running ticker, a lore sign-off. Sound: public/news.wav from scripts/news.py.
 */
export const News: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const v = useVertical();

  // A. Sting
  const stingIn = spring({ frame: frame - T.sting, fps, config: { damping: 12 } });
  const stingSpin = interpolate(frame, [0, 30], [540, 0], { extrapolateRight: "clamp", easing: (t) => 1 - (1 - t) ** 3 });
  const breaking = spring({ frame: frame - T.breaking, fps, config: { damping: 11, stiffness: 220 } });
  const stingOut = interpolate(frame, [T.studio - 6, T.studio], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // B. Studio
  const studio = interpolate(frame, [T.studio - 4, T.studio + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const studioOut = interpolate(frame, [T.signoff - 8, T.signoff], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const idx = Math.max(0, Math.min(STORIES.length - 1, [...T.stories].filter((s) => frame >= s).length - 1));
  const storyAt = T.stories[idx];
  const story = STORIES[idx];
  const wall = spring({ frame: frame - storyAt, fps, config: { damping: 14 } });
  const lower = spring({ frame: frame - storyAt - 6, fps, config: { damping: 16 } });
  const count = interpolate(frame, [storyAt, storyAt + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - (1 - t) ** 3 });
  const bigNum = Math.round(Number(story.big) * count);
  const lore = frame >= T.lore && frame < T.signoff;
  const loreIn = spring({ frame: frame - T.lore, fps, config: { damping: 18 } });

  // C. Sign-off
  const sign = spring({ frame: frame - T.signoff, fps, config: { damping: 14 } });

  const tickerX = -((frame * (v ? 7 : 9)) % 2400);
  const clock = "LIVE · 26 SEP 2026";

  return (
    <AbsoluteFill style={{ background: "#050a14", overflow: "hidden", perspective: 1400 }}>
      {/* ===== B. Studio ===== */}
      <AbsoluteFill style={{ opacity: studio * studioOut }}>
        {/* Studio backdrop: light beams and a floor glow */}
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 110%, #12305a 0%, #071225 45%, #03060d 100%)` }} />
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: -100,
              left: `${6 + i * 15}%`,
              width: 140,
              height: "130%",
              background: "linear-gradient(180deg, rgba(120,170,255,0.16), transparent 75%)",
              transform: `skewX(${-20 + i * 7 + Math.sin(frame / 40 + i) * 3}deg)`,
              filter: "blur(10px)",
            }}
          />
        ))}

        {/* Video wall */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: v ? 330 : 110,
            width: v ? 960 : 1500,
            height: v ? 760 : 560,
            marginLeft: v ? -480 : -750,
            borderRadius: 18,
            background: `linear-gradient(135deg, #0e2a52, ${NAVY})`,
            border: "3px solid #25467a",
            boxShadow: "0 30px 90px rgba(0,0,0,0.6), inset 0 0 80px rgba(80,140,255,0.15)",
            overflow: "hidden",
          }}
        >
          {/* screen grid */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
          {!lore ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: v ? 20 : 50, flexDirection: v ? "column" : "row", transform: `scale(${0.85 + 0.15 * wall})`, opacity: wall }}>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 300 : 300, lineHeight: 0.9, color: "#fff", textShadow: "0 0 60px rgba(120,170,255,0.5)", fontVariantNumeric: "tabular-nums" }}>{bigNum}</div>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 64 : 64, color: GOLD, letterSpacing: 3, lineHeight: 1.05, textAlign: v ? "center" : "left" }}>
                {story.unit.split(" ").map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, opacity: loreIn, transform: `translateY(${(1 - loreIn) * 30}px)`, padding: "0 60px", textAlign: "center" }}>
              <Frond size={v ? 170 : 140} draw={false} />
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 82 : 86, color: "#fff", lineHeight: 1.08 }}>
                The forest is growing.
                <br />
                <span style={{ color: GREEN }}>The tide is rising.</span>
              </div>
            </div>
          )}
          {/* LIVE badge */}
          <div style={{ position: "absolute", top: 22, left: 24, display: "flex", alignItems: "center", gap: 10, fontFamily: F.mono, fontSize: 22, color: "#fff", letterSpacing: 3 }}>
            <span style={{ width: 16, height: 16, borderRadius: 8, background: RED, opacity: Math.floor(frame / 12) % 2 ? 1 : 0.35 }} />
            {clock}
          </div>
          <div style={{ position: "absolute", top: 18, right: 22 }}>
            <Logo size={70} />
          </div>
        </div>

        {/* Lower third */}
        {!lore && (
          <div
            style={{
              position: "absolute",
              left: v ? 40 : 110,
              right: v ? 40 : 110,
              bottom: v ? 330 : 150,
              transform: `translateX(${(1 - lower) * -120}%)`,
            }}
          >
            <div style={{ display: "inline-block", background: RED, color: "#fff", fontFamily: F.display, fontWeight: 700, fontSize: v ? 30 : 30, letterSpacing: 4, padding: "8px 20px" }}>BREAKING</div>
            <div style={{ background: "#fff", color: NAVY, fontFamily: F.display, fontWeight: 700, fontSize: v ? 50 : 56, padding: v ? "16px 24px" : "14px 26px", lineHeight: 1.1 }}>{story.head}</div>
            <div style={{ background: NAVY, color: "#cfe0ff", fontFamily: F.body, fontSize: v ? 30 : 30, padding: "10px 26px" }}>{story.sub}</div>
          </div>
        )}
      </AbsoluteFill>

      {/* Ticker (studio and sign-off) */}
      {frame >= T.studio && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: v ? 90 : 78, display: "flex", background: GOLD, opacity: studio, zIndex: 5 }}>
          <div style={{ flex: "none", background: RED, color: "#fff", fontFamily: F.display, fontWeight: 700, fontSize: v ? 36 : 32, display: "flex", alignItems: "center", padding: "0 26px", letterSpacing: 3, zIndex: 1 }}>FNN</div>
          <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: tickerX, display: "flex", alignItems: "center", whiteSpace: "nowrap", fontFamily: F.mono, fontWeight: 500, fontSize: v ? 34 : 30, color: NAVY }}>
              {TICKER.repeat(4)}
            </div>
          </div>
        </div>
      )}

      {/* ===== A. Sting ===== */}
      {frame < T.studio && (
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, #13305c, ${NAVY} 45%, #02050b)`, alignItems: "center", justifyContent: "center", opacity: stingOut }}>
          {/* sweeping rays */}
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} style={{ position: "absolute", width: 6, height: width, background: "linear-gradient(180deg, transparent, rgba(245,197,66,0.25), transparent)", transform: `rotate(${i * 15 + frame * 2}deg)` }} />
          ))}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, transform: `scale(${0.6 + 0.4 * stingIn})`, opacity: stingIn }}>
            <Logo size={v ? 260 : 240} spin={stingSpin} />
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 110 : 120, color: "#fff", letterSpacing: 10, lineHeight: 1 }}>FNN</div>
            <div style={{ fontFamily: F.mono, fontSize: v ? 28 : 28, color: GOLD, letterSpacing: 6, textAlign: "center" }}>FUCI NEWS NETWORK</div>
          </div>
          {frame >= T.breaking && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: v ? 420 : 150,
                background: RED,
                color: "#fff",
                textAlign: "center",
                fontFamily: F.display,
                fontWeight: 700,
                fontSize: v ? 84 : 96,
                letterSpacing: 12,
                padding: "10px 0",
                transform: `scaleX(${breaking})`,
              }}
            >
              BREAKING
            </div>
          )}
        </AbsoluteFill>
      )}

      {/* ===== C. Sign-off ===== */}
      {frame >= T.signoff && (
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 42%, #13305c, ${NAVY} 50%, #02050b)`, alignItems: "center", justifyContent: "center", paddingBottom: v ? 90 : 78 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 26 : 20, opacity: sign, transform: `scale(${0.9 + 0.1 * sign})`, textAlign: "center", padding: "0 40px" }}>
            <Logo size={v ? 150 : 130} />
            <div style={{ fontFamily: F.mono, fontSize: v ? 26 : 24, color: GOLD, letterSpacing: 5 }}>REPORTING FROM BENEATH THE ARC</div>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 92 : 96, color: "#fff", letterSpacing: -2, lineHeight: 1.05 }}>
              Spawn your agent
              <br />
              for <span style={{ color: GREEN }}>$1</span>.
            </div>
            <div style={{ fontFamily: F.mono, fontSize: v ? 34 : 32, color: "#cfe0ff", letterSpacing: 2 }}>fuci.family · $FUCI</div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
