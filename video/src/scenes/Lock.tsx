import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, useIn, useVertical } from "../theme";

/** Frame timings, shared with scripts/storm.py so the sound lands on the picture. */
export const T = {
  lines: [12, 118, 178],
  lineLen: [92, 56, 50],
  bolts: [22, 64, 96],
  descend: [100, 150],
  card: 222,
  slam: 244,
  rows: 262, // + i * 8
  outro: 312,
};

const LORE = ["Storms hit the surface.", "Down here, the holdfast doesn't let go.", "Neither does the dev."];

/** What the Argus lock holds (from the lock screen): the whole dev wallet, for a year. */
const ROWS: [string, string][] = [
  ["Amount", "27.9M $FUCI"],
  ["Share", "Full dev wallet · 2.79% of supply"],
  ["Locked for", "1 year"],
  ["Unlocks", "Sep 25, 2027"],
];

const rnd = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * 12 s: a storm on the surface, the holdfast gripping the rock below, then the dev's $FUCI locked
 * for a year on Argus. Sound: public/storm.wav from scripts/storm.py.
 */
export const Lock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const v = useVertical();

  // The camera sinks from the storm to the seabed.
  const sink = interpolate(frame, T.descend, [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => t * t * (3 - 2 * t) });
  const worldY = -sink * height;
  const flash = Math.max(...T.bolts.map((b) => interpolate(frame, [b, b + 2, b + 10], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const scene = interpolate(frame, [T.card - 16, T.card], [1, 0.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const card = spring({ frame: frame - T.card, fps, config: { damping: 15 } });
  const shackle = spring({ frame: frame - T.slam, fps, config: { damping: 9, stiffness: 260 } });
  const shake = frame >= T.slam && frame < T.slam + 10 ? Math.sin(frame * 3) * (T.slam + 10 - frame) * 1.4 : 0;
  const rise = spring({ frame: frame - T.outro, fps, config: { damping: 18 } });
  const outro = useIn(T.outro + 4);
  const cardW = v ? 940 : 1100;

  const rootsDrawn = interpolate(frame, [T.lines[1] - 6, T.lines[1] + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bedY = height * 2 - (v ? 260 : 170); // seabed, in world coordinates
  const cx = width / 2;

  return (
    <AbsoluteFill style={{ background: "#03070c", overflow: "hidden" }}>
      {/* ===== The world: storm above, seabed below ===== */}
      <AbsoluteFill style={{ opacity: scene, transform: `translateX(${shake}px)` }}>
        <div style={{ position: "absolute", left: 0, top: worldY, width, height: height * 2 }}>
          {/* Sky and deep water */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, #1b2330 0%, #2a3442 22%, #0f2a3d 50%, #06182a 70%, #020a14 100%)",
            }}
          />
          {/* Waves */}
          <svg width={width} height={height} style={{ position: "absolute", top: height * 0.25, maskImage: "linear-gradient(180deg, black 45%, transparent 95%)" }}>
            {[0, 1, 2].map((k) => {
              const amp = 38 - k * 8;
              const pts = Array.from({ length: 41 }, (_, i) => {
                const x = (i / 40) * width;
                const y = 120 + k * 70 + Math.sin(i * 0.55 + frame / (9 - k) + k) * amp + Math.sin(i * 1.3 - frame / 6) * amp * 0.35;
                return `${i ? "L" : "M"}${x.toFixed(0)} ${y.toFixed(0)}`;
              }).join(" ");
              return <path key={k} d={`${pts} L${width} ${height} L0 ${height} Z`} fill={["#26394d", "#1a3047", "#10263b"][k]} opacity={0.95} />;
            })}
          </svg>
          {/* Rain */}
          <svg width={width} height={height * 0.8} style={{ position: "absolute", top: 0 }}>
            {Array.from({ length: 90 }, (_, i) => {
              const x = (rnd(i) * width * 1.2 + frame * 14) % (width * 1.2) - width * 0.1;
              const y = (rnd(i + 50) * height * 0.8 + frame * 38) % (height * 0.8);
              return <line key={i} x1={x} y1={y} x2={x - 14} y2={y + 44} stroke="rgba(200,220,240,0.35)" strokeWidth={2} />;
            })}
          </svg>
          {/* Lightning bolts */}
          {T.bolts.map((b, n) => {
            const a = interpolate(frame, [b, b + 1, b + 7], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            if (a <= 0) return null;
            const x0 = width * (0.25 + 0.25 * n);
            let x = x0;
            const d = Array.from({ length: 9 }, (_, i) => {
              x += (rnd(i + n * 20) - 0.5) * 90;
              return `${i ? "L" : "M"}${x.toFixed(0)} ${(i * height * 0.05).toFixed(0)}`;
            }).join(" ");
            return (
              <svg key={b} width={width} height={height} style={{ position: "absolute", top: 0, opacity: a }}>
                <path d={d} fill="none" stroke="#eef6ff" strokeWidth={5} style={{ filter: "drop-shadow(0 0 16px #bfe3ff)" }} />
              </svg>
            );
          })}
          {/* Seabed: a rock, the holdfast gripping it, one strong stalk */}
          <svg width={width} height={height * 2} style={{ position: "absolute", top: 0 }}>
            <path d={`M0 ${bedY + 40} Q ${width * 0.3} ${bedY - 10} ${width * 0.5} ${bedY + 20} T ${width} ${bedY + 30} L ${width} ${height * 2} L 0 ${height * 2} Z`} fill="#0b1a14" />
            <ellipse cx={cx} cy={bedY + 30} rx={v ? 220 : 260} ry={v ? 90 : 100} fill="#1d2a2a" />
            <ellipse cx={cx - 40} cy={bedY + 10} rx={v ? 120 : 150} ry={40} fill="#27373a" />
            {/* Holdfast roots, drawn in as it grips */}
            {Array.from({ length: 9 }, (_, i) => {
              const side = i - 4;
              const ex = cx + side * (v ? 44 : 52);
              const d = `M${cx} ${bedY - 40} C ${cx + side * 10} ${bedY - 10}, ${ex} ${bedY - 20}, ${ex + side * 6} ${bedY + 40 + Math.abs(side) * 4}`;
              return <path key={i} d={d} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - rootsDrawn} fill="none" stroke="#6b5a2e" strokeWidth={9 - Math.abs(side)} strokeLinecap="round" />;
            })}
            {(() => {
              const pts = Array.from({ length: 13 }, (_, k) => {
                const t = k / 12;
                return [cx + Math.sin(frame / 40 + k * 0.5) * t * 34, bedY - 40 - t * (v ? 700 : 560)] as const;
              });
              return (
                <g opacity={rootsDrawn}>
                  <path d={pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} fill="none" stroke="#4a6b1c" strokeWidth={12} strokeLinecap="round" />
                  {pts.slice(2).map(([x, y], k) => {
                    const s = k % 2 ? 1 : -1;
                    return <ellipse key={k} cx={x + s * 34} cy={y} rx={46} ry={12} fill={k % 3 ? "#4d7c0f" : "#65a30d"} transform={`rotate(${s * (-24 + Math.sin(frame / 28 + k) * 6)} ${x} ${y})`} />;
                  })}
                </g>
              );
            })()}
          </svg>
        </div>
        {/* Lore lines */}
        {LORE.map((line, i) => {
          const at = T.lines[i];
          const len = T.lineLen[i];
          const a = interpolate(frame, [at, at + 12, at + len - 10, at + len], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <AbsoluteFill key={i} style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: v ? 360 : 170 }}>
              <div
                style={{
                  maxWidth: v ? 900 : 1500,
                  textAlign: "center",
                  fontFamily: F.display,
                  fontWeight: i === 2 ? 700 : 500,
                  fontSize: v ? 84 : 84,
                  letterSpacing: -1.5,
                  lineHeight: 1.1,
                  color: "#f1f5f9",
                  textShadow: "0 4px 40px rgba(0,0,0,0.85)",
                  opacity: a,
                  filter: `blur(${(1 - a) * 10}px)`,
                  transform: `translateY(${(1 - a) * 20}px)`,
                }}
              >
                {line}
              </div>
            </AbsoluteFill>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#e8f4ff", opacity: flash * 0.55, pointerEvents: "none" }} />

      {/* ===== The lock ===== */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: frame >= T.card - 2 ? 1 : 0 }}>
        <div
          style={{
            position: "absolute",
            width: cardW,
            borderRadius: 22,
            border: "1.5px solid #2a2a2a",
            background: "rgba(10,10,10,0.94)",
            boxShadow: `0 30px 90px rgba(0,0,0,0.7), 0 0 ${80 * Math.min(1, shackle)}px rgba(34,197,94,0.18)`,
            opacity: card,
            transform: `translate(${shake}px, ${(1 - card) * 120 - rise * (v ? 200 : 110)}px) scale(${(0.94 + 0.06 * card) * (1 - rise * (v ? 0.04 : 0.14))})`,
            padding: v ? "40px 44px 36px" : "36px 48px 34px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: v ? 30 : 36 }}>
            {/* Padlock: the shackle drops shut on the slam */}
            <svg width={v ? 150 : 140} height={v ? 170 : 160} viewBox="0 0 120 140" style={{ flex: "none" }}>
              <path
                d="M30 64 V40 a30 30 0 0 1 60 0 V64"
                fill="none"
                stroke={frame >= T.slam ? C.up : "#9ca3af"}
                strokeWidth={12}
                strokeLinecap="round"
                transform={`translate(0 ${-22 * (1 - Math.min(1, shackle))})`}
              />
              <rect x={14} y={60} width={92} height={74} rx={14} fill={frame >= T.slam ? C.up : "#6b7280"} />
              <circle cx={60} cy={92} r={9} fill="#0a0a0a" />
              <rect x={56} y={96} width={8} height={18} rx={3} fill="#0a0a0a" />
            </svg>
            <div>
              <div style={{ fontFamily: F.mono, fontSize: v ? 24 : 22, letterSpacing: 5, color: C.muted, textTransform: "uppercase" }}>Argus lock</div>
              <div style={{ marginTop: 6, fontFamily: F.display, fontWeight: 700, fontSize: v ? 76 : 76, letterSpacing: -2, lineHeight: 1.02, color: C.ink }}>
                Dev bag <span style={{ color: frame >= T.slam ? C.up : C.ink }}>locked</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: v ? 30 : 26, borderTop: "1px solid #222" }}>
            {ROWS.map(([k, val], i) => {
              const s = spring({ frame: frame - T.rows - i * 8, fps, config: { damping: 16 } });
              return (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 24,
                    padding: v ? "18px 0" : "14px 0",
                    borderBottom: "1px solid #222",
                    fontFamily: F.body,
                    fontSize: v ? 32 : 30,
                    opacity: s,
                    transform: `translateX(${(1 - s) * 24}px)`,
                  }}
                >
                  <span style={{ color: C.muted }}>{k}</span>
                  <span style={{ color: i === 3 ? C.up : C.ink, fontWeight: 600, textAlign: "right" }}>{val}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: v ? 330 : 70,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: outro,
            transform: `translateY(${(1 - outro) * 30}px)`,
          }}
        >
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 84 : 84, letterSpacing: -2, color: C.ink, textAlign: "center", lineHeight: 1.05 }}>
            Rooted for a year. <span style={{ color: C.up }}>🌿</span>
          </div>
          <div style={{ marginTop: 18, fontFamily: F.mono, fontSize: v ? 30 : 28, color: C.ink2, letterSpacing: 1, textAlign: "center" }}>
            verify on argus.world/lock
            {v ? <br /> : "  ·  "}
            fuci.family
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
