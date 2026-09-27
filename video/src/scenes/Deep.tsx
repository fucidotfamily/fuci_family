import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Frond, useVertical } from "../theme";

/** Frame timings, shared with scripts/deep.py so the sound lands on the picture. */
export const T = {
  line1: 10, // "In the deep, where sunlight never reaches,"
  line2: 100, // "life makes its own light."
  card: 196, // the field-guide card
  rows: [214, 230, 246, 262, 278] as const,
  spread: 330, // "Beneath the Arc, a new species is spreading."
  cta: 392,
};

/** Every ERC-8004 agent on Arc, and the ones created on Fuci (fuci.family/api/stats/public, 26 Sep 2026). */
const ARC_AGENTS = 287;
const FUCI_AGENTS = 8;

/**
 * Shots cut from "Psychedelic Medusa" (NOAA Office of Ocean Exploration, public domain):
 * [start frame in this video, length, second in the source clip].
 */
const SHOTS: [number, number, number][] = [
  [0, 100, 21], // a small medusa drifting in blue water
  [100, 96, 12.5], // hovering over the seafloor
  [196, 134, 48], // the glowing close-up
  [330, 62, 36.5], // far away, drifting
  [392, 58, 52.5], // close-up again, under the call to action
];

const PINK = "#ff5c9a";
const PAPER = "#f4efe4";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const ROWS: [string, React.ReactNode][] = [
  ["SPECIES", <><i>Fucus agentis</i> · AI agent</>],
  ["HABITAT", "Arc Mainnet"],
  ["DIET", "Data, paid per call in USDC (x402)"],
  ["IDENTITY", "ERC-8004, on-chain"],
  ["POPULATION", `${ARC_AGENTS} on Arc · ${FUCI_AGENTS} born on Fuci`],
];

/**
 * 15 s: "The Deep". A nature documentary on real deep-sea footage: a glowing medusa, then a field-guide
 * card for a new species, the Fuci agent. Sound: public/deep.wav from scripts/deep.py.
 * Footage: public/footage/medusa.webm (scripts/footage.sh).
 */
export const Deep: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useVertical();

  const line = (at: number, out: number) => interpolate(frame, [at, at + 16, out - 12, out], [0, 1, 1, 0], clamp);
  const card = spring({ frame: frame - T.card, fps, config: { damping: 18 } });
  const cardOut = interpolate(frame, [T.spread - 10, T.spread], [1, 0], clamp);
  const cta = spring({ frame: frame - T.cta, fps, config: { damping: 16 } });
  // Darker under text, lighter when the footage is the story.
  const dim = interpolate(frame, [0, 20, 190, 200, 320, 335, T.cta - 4, T.cta + 10], [1, 0.45, 0.45, 0.25, 0.3, 0.45, 0.45, 0.7], clamp);

  const Narration: React.FC<{ a: number; children: React.ReactNode; top: string }> = ({ a, children, top }) => (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        padding: "0 80px",
        textAlign: "center",
        fontFamily: F.display,
        fontWeight: 500,
        fontSize: v ? 68 : 70,
        lineHeight: 1.18,
        letterSpacing: -0.5,
        color: PAPER,
        opacity: a,
        filter: `blur(${(1 - a) * 6}px)`,
        textShadow: "0 4px 40px rgba(0,0,0,0.8)",
      }}
    >
      {children}
    </div>
  );

  return (
    <AbsoluteFill style={{ background: "#01060c", overflow: "hidden" }}>
      {/* The footage, cut into shots, with a slow push-in on each */}
      {SHOTS.map(([from, len, src], i) => (
        <Sequence key={i} from={from} durationInFrames={len}>
          <Shot len={len} src={src} />
        </Sequence>
      ))}

      {/* Grade: deep-blue tint, vignette, darkening under text */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(1,10,24,0.35), rgba(1,6,14,0.15) 40%, rgba(1,6,14,0.55))", mixBlendMode: "multiply" }} />
      <AbsoluteFill style={{ background: `rgba(1,6,12,${dim})` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)" }} />
      {/* Letterbox (landscape only) */}
      {!v && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 70, background: "#000" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 70, background: "#000" }} />
        </>
      )}

      {/* Narration */}
      <Narration a={line(T.line1, T.line2)} top={v ? "40%" : "38%"}>
        In the deep,
        <br />
        where sunlight never reaches,
      </Narration>
      <Narration a={line(T.line2, T.card)} top={v ? "40%" : "38%"}>
        life makes its <span style={{ color: PINK }}>own light</span>.
      </Narration>
      <Narration a={line(T.spread, T.cta)} top={v ? "38%" : "34%"}>
        Beneath the Arc,
        <br />a new species is spreading.
      </Narration>

      {/* Field guide card */}
      {frame >= T.card && frame < T.spread + 2 && (
        <div
          style={{
            position: "absolute",
            left: v ? 50 : undefined,
            right: v ? 50 : 110,
            bottom: v ? 260 : 120,
            width: v ? undefined : 820,
            padding: v ? "34px 38px" : "30px 36px",
            background: "rgba(244,239,228,0.93)",
            color: "#122029",
            borderRadius: 6,
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
            opacity: card * cardOut,
            transform: `translateY(${(1 - card) * 40}px)`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #122029", paddingBottom: 12, marginBottom: 14 }}>
            <div style={{ fontFamily: F.mono, fontSize: v ? 24 : 20, letterSpacing: 5 }}>FIELD NOTES · NO. 001</div>
            <div style={{ fontFamily: F.mono, fontSize: v ? 22 : 18, letterSpacing: 3, color: "#b0164f" }}>NEW SPECIES</div>
          </div>
          {ROWS.map(([k, val], i) => {
            const a = interpolate(frame, [T.rows[i], T.rows[i] + 10], [0, 1], clamp);
            return (
              <div key={k} style={{ display: "flex", gap: 20, alignItems: "baseline", padding: v ? "9px 0" : "7px 0", opacity: a, transform: `translateX(${(1 - a) * 16}px)` }}>
                <div style={{ flex: "none", width: v ? 220 : 190, fontFamily: F.mono, fontSize: v ? 22 : 19, letterSpacing: 3, color: "#5b6b72" }}>{k}</div>
                <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: v ? 36 : 32, lineHeight: 1.2 }}>{val}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Call to action */}
      {frame >= T.cta && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 26 : 20, opacity: cta, transform: `translateY(${(1 - cta) * 24}px)`, padding: "0 50px", textAlign: "center" }}>
            <Frond size={v ? 110 : 90} draw={false} />
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 100 : 104, letterSpacing: -2, color: "#fff", lineHeight: 1.02, textShadow: "0 6px 40px rgba(0,0,0,0.7)" }}>
              Spawn your own.
            </div>
            <div style={{ fontFamily: F.body, fontSize: v ? 38 : 36, color: "#e8eef0" }}>
              Your AI agent on Arc for <span style={{ color: PINK, fontWeight: 600 }}>$1</span>.
            </div>
            <div style={{ fontFamily: F.mono, fontSize: v ? 36 : 32, color: PINK, letterSpacing: 2 }}>fuci.family · $FUCI</div>
          </div>
        </AbsoluteFill>
      )}

      {/* Credit */}
      <div style={{ position: "absolute", right: v ? 40 : 60, bottom: v ? 60 : 22, fontFamily: F.mono, fontSize: v ? 18 : 15, color: "rgba(255,255,255,0.5)", letterSpacing: 1, opacity: interpolate(frame, [T.cta, T.cta + 20], [0, 1], clamp) }}>
        Footage: NOAA Ocean Exploration (public domain)
      </div>
    </AbsoluteFill>
  );
};

/** One shot: the clip from `src` seconds, cropped to fill the frame, slowly pushing in. */
const Shot: React.FC<{ len: number; src: number }> = ({ len, src }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = interpolate(frame, [0, len], [1.04, 1.12]);
  const fade = interpolate(frame, [0, 8, len - 6, len], [0, 1, 1, 0.6], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <OffthreadVideo
        src={staticFile("footage/medusa.webm")}
        trimBefore={Math.round(src * fps)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})`, filter: "saturate(1.15) contrast(1.08)" }}
      />
    </AbsoluteFill>
  );
};
