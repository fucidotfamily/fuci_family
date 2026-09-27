import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, Frond, Typed, useIn, useVertical } from "../theme";

// GitHub dark, not the kelp look of the other clips.
const G = { bg: "#0d1117", panel: "#161b22", line: "#30363d", ink: "#e6edf3", ink2: "#8b949e", link: "#58a6ff", green: "#238636" };

const REPO = "fucidotfamily/fuci_family";
const CMD = `git clone https://github.com/${REPO}`;
const CPS = 40;

/** Frame timings, shared with scripts/github.py so the sound lands on the picture. */
export const T = {
  type: 8,
  lines: [54, 60, 66],
  swap: 70,
  rows: 94, // + i * 5
  star: 138,
  chips: 150, // + i * 6
  headline: 180,
  footer: 196,
};

const TREE: [string, boolean][] = [
  ["app", true],
  ["components", true],
  ["contracts", true],
  ["lib", true],
  ["mcp", true],
  ["LICENSE", false],
  ["README.md", false],
];
const LANGS: [string, string, number][] = [
  ["TypeScript", "#3178c6", 0.86],
  ["Solidity", "#aa6746", 0.05],
  ["Python", "#3572a5", 0.05],
  ["Other", "#8b949e", 0.04],
];
const CHIPS = ["MIT License", "Next.js 16", "x402 · ERC-8004", "Arc Mainnet"];

const Folder: React.FC<{ dir: boolean; size: number }> = ({ dir, size }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: "none" }}>
    {dir ? (
      <path fill="#54aeff" d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
    ) : (
      <path fill={G.ink2} d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Z" />
    )}
  </svg>
);

/**
 * 8 s: "Fuci is open source". A terminal clones the repo, then the GitHub repo page builds itself.
 * Sound: public/github.wav from scripts/github.py (lo-fi beat, key clicks, star ding).
 */
export const OpenSource: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useVertical();
  const k = v ? 1.25 : 1; // type scale for portrait

  const termIn = useIn(0);
  const swap = spring({ frame: frame - T.swap, fps, config: { damping: 16 } });
  const card = spring({ frame: frame - T.swap - 4, fps, config: { damping: 15 } });
  const star = spring({ frame: frame - T.star, fps, config: { damping: 9, stiffness: 180 } });
  const starred = frame >= T.star + 3;
  const rise = spring({ frame: frame - T.headline + 6, fps, config: { damping: 18 } });
  const head = spring({ frame: frame - T.headline, fps, config: { damping: 13 } });
  const footer = useIn(T.footer);
  const cardW = v ? 960 : 1180;

  return (
    <AbsoluteFill style={{ background: G.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {/* Faint grid, drifting */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${G.line}55 1px, transparent 1px), linear-gradient(90deg, ${G.line}55 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          backgroundPosition: `0 ${frame * 0.6}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, rgba(35,134,54,${0.18 + 0.12 * star}), transparent 55%)` }} />

      {/* 1. Terminal */}
      <div
        style={{
          position: "absolute",
          width: v ? 980 : 1260,
          borderRadius: 14,
          border: `1.5px solid ${G.line}`,
          background: "#010409",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          opacity: termIn * (1 - swap),
          transform: `translateY(${(1 - termIn) * 40 - swap * 120}px) scale(${1 - 0.1 * swap})`,
        }}
      >
        <div style={{ display: "flex", gap: 10, padding: "16px 20px", borderBottom: `1px solid ${G.line}` }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
          ))}
          <span style={{ marginLeft: 16, fontFamily: F.mono, fontSize: 20 * k, color: G.ink2 }}>~ zsh</span>
        </div>
        <div style={{ padding: v ? "30px 32px" : "34px 40px", fontFamily: F.mono, fontSize: v ? 34 : 36, lineHeight: 1.55, color: G.ink, wordBreak: "break-all" }}>
          <div>
            <span style={{ color: C.up }}>$ </span>
            <Typed text={CMD} start={T.type} cps={CPS} caret={frame < T.lines[0]} />
          </div>
          {frame >= T.lines[0] && <div style={{ color: G.ink2 }}>Cloning into &apos;fuci_family&apos;…</div>}
          {frame >= T.lines[1] && (
            <div style={{ color: G.ink2 }}>
              Receiving objects: {Math.min(100, Math.round(interpolate(frame, [T.lines[1], T.lines[2]], [12, 100], { extrapolateRight: "clamp" })))}%
            </div>
          )}
          {frame >= T.lines[2] && <div style={{ color: C.up }}>✓ done.</div>}
        </div>
      </div>

      {/* 2. GitHub repo card */}
      <div
        style={{
          position: "absolute",
          width: cardW,
          borderRadius: 16,
          border: `1.5px solid ${G.line}`,
          background: G.panel,
          boxShadow: "0 30px 90px rgba(0,0,0,0.65)",
          opacity: card,
          transform: `translateY(${(1 - card) * 140 - rise * (v ? 250 : 150)}px) scale(${(0.94 + 0.06 * card) * (1 - rise * (v ? 0.06 : 0.2))})`,
          display: frame < T.swap ? "none" : "block",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: v ? "30px 34px 22px" : "30px 38px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, border: `1.5px solid ${G.line}`, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Frond size={44} draw={false} />
            </div>
            <div style={{ fontFamily: F.body, fontSize: (v ? 32 : 38) * k * (v ? 0.9 : 1), color: G.link, whiteSpace: "nowrap" }}>
              fucidotfamily / <b style={{ fontWeight: 600 }}>fuci_family</b>
            </div>
            <span style={{ padding: "4px 14px", borderRadius: 999, border: `1.5px solid ${G.line}`, fontFamily: F.body, fontSize: 20 * k, color: G.ink2 }}>Public</span>
            <div style={{ flex: 1 }} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                borderRadius: 10,
                border: `1.5px solid ${starred ? "#e3b341" : G.line}`,
                background: starred ? "rgba(227,179,65,0.12)" : "#21262d",
                fontFamily: F.body,
                fontWeight: 600,
                fontSize: 22 * k,
                color: starred ? "#e3b341" : G.ink,
                transform: `scale(${frame < T.star ? 1 : 0.9 + 0.1 * star + 0.12 * Math.sin(Math.PI * Math.min(1, star))})`,
                boxShadow: starred ? `0 0 ${40 * star}px rgba(227,179,65,0.45)` : undefined,
                flex: "none",
              }}
            >
              <span style={{ fontSize: 26 * k }}>{starred ? "★" : "☆"}</span>
              {starred ? "Starred" : "Star"}
            </div>
          </div>
          <div style={{ marginTop: 16, fontFamily: F.body, fontSize: 26 * k, color: G.ink }}>AI agents on Arc that pay their own way in USDC.</div>
          <div style={{ marginTop: 18, display: "flex", height: 10, borderRadius: 5, overflow: "hidden" }}>
            {LANGS.map(([name, c, w], i) => (
              <div key={name} style={{ width: `${w * 100 * interpolate(frame, [T.swap + 10 + i * 3, T.swap + 30 + i * 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}%`, background: c }} />
            ))}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 22, fontFamily: F.body, fontSize: 18 * k, color: G.ink2 }}>
            {LANGS.slice(0, 3).map(([name, c]) => (
              <span key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
                {name}
              </span>
            ))}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${G.line}` }}>
          {TREE.map(([name, dir], i) => {
            const s = spring({ frame: frame - T.rows - i * 5, fps, config: { damping: 18 } });
            return (
              <div
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: v ? "13px 34px" : "11px 38px",
                  borderBottom: i < TREE.length - 1 ? `1px solid ${G.line}` : undefined,
                  fontFamily: F.body,
                  fontSize: 24 * k,
                  color: G.ink,
                  opacity: s,
                  transform: `translateX(${(1 - s) * -30}px)`,
                }}
              >
                <Folder dir={dir} size={24 * k} />
                {name}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: v ? "20px 34px 26px" : "18px 38px 24px", borderTop: `1px solid ${G.line}`, background: "#0d1117" }}>
          {CHIPS.map((c, i) => {
            const s = spring({ frame: frame - T.chips - i * 6, fps, config: { damping: 12 } });
            return (
              <span
                key={c}
                style={{
                  padding: "8px 18px",
                  borderRadius: 999,
                  background: "rgba(56,139,253,0.12)",
                  border: "1px solid rgba(56,139,253,0.4)",
                  color: G.link,
                  fontFamily: F.body,
                  fontWeight: 500,
                  fontSize: 20 * k,
                  transform: `scale(${s})`,
                  opacity: s,
                }}
              >
                {c}
              </span>
            );
          })}
        </div>
      </div>

      {/* 3. Headline */}
      <div
        style={{
          position: "absolute",
          bottom: v ? 400 : 90,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: head,
          transform: `translateY(${(1 - head) * 40}px)`,
        }}
      >
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 100 : 100, letterSpacing: -3, color: G.ink, lineHeight: 1.05, textAlign: "center" }}>
          Fuci is <span style={{ color: C.up }}>open source.</span>
        </div>
        <div style={{ marginTop: 20, fontFamily: F.mono, fontSize: v ? 30 : 28, color: G.ink2, opacity: footer, textAlign: "center", letterSpacing: 1 }}>
          github.com/{REPO}
          {v ? <br /> : "  ·  "}
          fuci.family
        </div>
      </div>
    </AbsoluteFill>
  );
};
