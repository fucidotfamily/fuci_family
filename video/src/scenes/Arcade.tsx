import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { F, useVertical } from "../theme";

/** Frame timings, shared with scripts/arcade.py so the sound lands on the picture. */
export const T = {
  press: 54, // PRESS START is pressed
  coin: 66, // INSERT $1: the coin drops
  play: 90, // the level starts
  pickups: [124, 162, 200, 238, 276] as const,
  levelUp: 300,
  scores: 330, // player count screen
  cont: 390, // CONTINUE?
};

/** Every ERC-8004 agent on Arc, and the ones created on Fuci (fuci.family/api/stats/public, 26 Sep 2026). */
const ARC_AGENTS = 230;
const FUCI_AGENTS = 8;

const POWERUPS: { icon: string; label: string; color: string }[] = [
  { icon: "$", label: "USDC WALLET", color: "#38bdf8" },
  { icon: "ID", label: "ERC-8004 ID", color: "#a78bfa" },
  { icon: "402", label: "x402 PAYMENTS", color: "#f59e0b" },
  { icon: "M", label: "FUCI MARKET · 56 APIs", color: "#f472b6" },
  { icon: "A", label: "AUTOPILOT", color: "#22c55e" },
];

const GREEN = "#22c55e";
const YELLOW = "#facc15";
const SKY = "#0b1026";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The player: a little frond creature, 12×12 pixels. */
const SPRITE = [
  "..G..G..G...",
  "..GG.G.GG...",
  "...GGGGG....",
  "....GGG.....",
  "...GGGGG....",
  "..GWKGWKG...",
  "..GGGGGGG...",
  "..GGGGGGG...",
  "...GGGGG....",
  "...G...G....",
  "..GG...GG...",
  "............",
];
const SPRITE_RUN = [...SPRITE.slice(0, 9), "....G.G.....", "...GG.GG....", "............"];
const PAL: Record<string, string> = { G: GREEN, W: "#ffffff", K: "#0b1026" };

const Pixels: React.FC<{ rows: string[]; p: number }> = ({ rows, p }) => (
  <svg width={rows[0].length * p} height={rows.length * p} shapeRendering="crispEdges">
    {rows.flatMap((r, y) => [...r].map((c, x) => (PAL[c] ? <rect key={`${x}-${y}`} x={x * p} y={y * p} width={p} height={p} fill={PAL[c]} /> : null)))}
  </svg>
);

const Pixel: React.FC<{ children: React.ReactNode; size: number; color?: string; style?: React.CSSProperties }> = ({ children, size, color = "#fff", style }) => (
  <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: size, color, letterSpacing: size * 0.08, textShadow: `${size * 0.08}px ${size * 0.08}px 0 #000`, whiteSpace: "nowrap", ...style }}>{children}</div>
);

/**
 * 15 s: "FUCI: Agent Quest". An 8-bit arcade game: insert $1, your agent runs through the kelp and
 * picks up its powers (wallet, ID, x402, Fuci Market, autopilot), levels up, and the game asks you
 * to continue. Sound: public/arcade.wav from scripts/arcade.py.
 */
export const Arcade: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const v = useVertical();
  const p = v ? 12 : 11; // pixel size

  const inTitle = frame < T.play;
  const inPlay = frame >= T.play && frame < T.scores;
  const got = T.pickups.filter((f) => frame >= f).length;
  const score = got * 1000 + (frame >= T.levelUp ? 5000 : 0);

  // The level
  const groundY = v ? height * 0.66 : height * 0.74;
  const agentX = v ? width * 0.22 : width * 0.24;
  const speed = v ? 9 : 11; // px per frame the world scrolls
  const scroll = Math.max(0, frame - T.play) * speed;
  const jump = T.pickups.reduce((j, f) => {
    const t = frame - (f - 10);
    return t >= 0 && t <= 20 ? Math.max(j, Math.sin((t / 20) * Math.PI)) : j;
  }, 0);
  const agentY = groundY - 12 * p - jump * (v ? 180 : 150);
  const runFrame = Math.floor(frame / 4) % 2 === 0;

  const levelUp = spring({ frame: frame - T.levelUp, fps, config: { damping: 10 } });
  const scores = spring({ frame: frame - T.scores, fps, config: { damping: 16 } });
  const cont = spring({ frame: frame - T.cont, fps, config: { damping: 14 } });
  const countdown = Math.max(1, 9 - Math.floor((frame - T.cont) / 8));

  return (
    <AbsoluteFill style={{ background: SKY, overflow: "hidden" }}>
      {/* Stars */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }} shapeRendering="crispEdges">
        {Array.from({ length: 70 }, (_, i) => {
          const x = (((i * 373) % width) - (inPlay ? scroll * 0.1 : 0) + width * 4) % width;
          const y = (i * 211) % (groundY * 0.8);
          return <rect key={i} x={x} y={y} width={4} height={4} fill="#fff" opacity={0.25 + 0.2 * ((i * 7) % 3)} />;
        })}
      </svg>

      {/* ===== Title screen ===== */}
      {inTitle && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: v ? 40 : 30, opacity: interpolate(frame, [T.play - 8, T.play], [1, 0], clamp) }}>
          <div style={{ transform: `translateY(${interpolate(frame, [0, 18], [-300, 0], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <Pixels rows={SPRITE} p={v ? 18 : 16} />
            <Pixel size={v ? 150 : 170} color={GREEN} style={{ fontWeight: 500, textShadow: `10px 10px 0 #064e3b` }}>
              FUCI
            </Pixel>
            <Pixel size={v ? 50 : 52} color={YELLOW}>
              AGENT QUEST
            </Pixel>
          </div>
          <Pixel size={v ? 30 : 28} color="#94a3b8" style={{ opacity: interpolate(frame, [14, 26], [0, 1], clamp) }}>
            A KELP FOREST BENEATH THE ARC
          </Pixel>
          <div style={{ height: v ? 70 : 56, display: "flex", alignItems: "center" }}>
            {frame < T.press ? (
              <Pixel size={v ? 44 : 40} style={{ opacity: frame > 24 ? 0.6 + 0.4 * Math.sin(frame / 5) : 0 }}>
                ▶ PRESS START
              </Pixel>
            ) : (
              <Pixel size={v ? 44 : 40} color={YELLOW}>
                INSERT <span style={{ color: GREEN }}>$1</span> {frame >= T.coin ? "✓" : ""}
              </Pixel>
            )}
          </div>
          {/* The coin */}
          {frame >= T.press && frame < T.coin + 6 && (
            <div
              style={{
                position: "absolute",
                left: width / 2 - 30,
                top: interpolate(frame, [T.press, T.coin], [-80, height * (v ? 0.78 : 0.82)], { ...clamp, easing: (t) => t * t }),
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: YELLOW,
                border: "6px solid #a16207",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: F.mono,
                fontSize: 30,
                color: "#a16207",
                transform: `scaleX(${Math.abs(Math.cos(frame / 3))})`,
              }}
            >
              $
            </div>
          )}
        </AbsoluteFill>
      )}

      {/* ===== The level ===== */}
      {inPlay && (
        <AbsoluteFill style={{ opacity: interpolate(frame, [T.play, T.play + 8, T.scores - 8, T.scores], [0, 1, 1, 0], clamp) }}>
          {/* Kelp in the back */}
          <svg width={width} height={height} style={{ position: "absolute", inset: 0 }} shapeRendering="crispEdges">
            {Array.from({ length: 14 }, (_, i) => {
              const x = ((i * 260 - scroll * 0.4) % (width + 300) + width + 300) % (width + 300) - 150;
              const h = 180 + ((i * 97) % 220);
              return Array.from({ length: Math.floor(h / p) }, (_, k) => (
                <rect key={`${i}-${k}`} x={x + Math.round(Math.sin(k / 3 + frame / 12 + i) * 1.5) * p} y={groundY - (k + 1) * p} width={p} height={p} fill="#14532d" opacity={0.8} />
              ));
            })}
          </svg>
          {/* Ground */}
          <svg width={width} height={height - groundY} style={{ position: "absolute", left: 0, top: groundY }} shapeRendering="crispEdges">
            {Array.from({ length: Math.ceil(width / (4 * p)) + 2 }, (_, i) => {
              const x = i * 4 * p - (scroll % (8 * p));
              return (
                <g key={i}>
                  <rect x={x} y={0} width={4 * p} height={2 * p} fill={i % 2 ? "#65a30d" : "#4d7c0f"} />
                  <rect x={x} y={2 * p} width={4 * p} height={height} fill={i % 2 ? "#78350f" : "#6b2f0c"} />
                </g>
              );
            })}
          </svg>

          {/* Power-ups coming in */}
          {POWERUPS.map((u, i) => {
            const f = T.pickups[i];
            const x = agentX + (f - frame) * speed;
            const size = v ? 110 : 96;
            const y = groundY - 12 * p - (v ? 190 : 160) + Math.sin(frame / 6 + i) * 8;
            if (frame >= f || x > width + 50) return null;
            return (
              <div key={u.label} style={{ position: "absolute", left: x, top: y, width: size, height: size, background: u.color, border: `${p * 0.6}px solid #fff`, boxShadow: `${p * 0.6}px ${p * 0.6}px 0 #000`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Pixel size={u.icon.length > 2 ? size * 0.3 : size * 0.44} color="#0b1026" style={{ textShadow: "none", letterSpacing: 0 }}>
                  {u.icon}
                </Pixel>
              </div>
            );
          })}

          {/* Quest line */}
          <div style={{ position: "absolute", left: 0, right: 0, top: v ? 330 : 170, display: "flex", justifyContent: "center", opacity: interpolate(frame, [T.play + 6, T.play + 16, T.levelUp - 6, T.levelUp], [0, 1, 1, 0], clamp) }}>
            <Pixel size={v ? 38 : 34} color="#94a3b8">
              QUEST: <span style={{ color: "#fff" }}>POWER UP YOUR AGENT</span>
            </Pixel>
          </div>

          {/* The agent */}
          <div style={{ position: "absolute", left: agentX, top: agentY }}>
            <Pixels rows={jump > 0 ? SPRITE : runFrame ? SPRITE : SPRITE_RUN} p={p} />
          </div>

          {/* Pickup popups */}
          {POWERUPS.map((u, i) => {
            const f = T.pickups[i];
            const t = frame - f;
            if (t < 0 || t > 34) return null;
            return (
              <div key={u.label} style={{ position: "absolute", left: agentX - 20, top: groundY - 12 * p - (v ? 400 : 330) - t * 2, opacity: interpolate(t, [0, 4, 26, 34], [0, 1, 1, 0]) }}>
                <Pixel size={v ? 44 : 44} color={u.color}>
                  + {u.label}
                </Pixel>
              </div>
            );
          })}

          {/* LEVEL UP */}
          {frame >= T.levelUp && (
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
              <div style={{ transform: `scale(${levelUp})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: v ? -300 : -200 }}>
                <Pixel size={v ? 110 : 120} color={YELLOW} style={{ textShadow: "8px 8px 0 #92400e" }}>
                  LEVEL UP!
                </Pixel>
                <Pixel size={v ? 36 : 34}>YOUR AGENT IS READY</Pixel>
              </div>
            </AbsoluteFill>
          )}

          {/* Inventory */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: v ? 200 : 26, display: "flex", justifyContent: "center", gap: v ? 18 : 16 }}>
            {POWERUPS.map((u, i) => {
              const has = i < got;
              return (
                <div key={u.label} style={{ width: v ? 120 : 84, height: v ? 120 : 84, border: `${p * 0.5}px solid ${has ? "#fff" : "#334155"}`, background: has ? u.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Pixel size={v ? (u.icon.length > 2 ? 34 : 48) : u.icon.length > 2 ? 26 : 36} color={has ? "#0b1026" : "#334155"} style={{ textShadow: "none", letterSpacing: 0 }}>
                    {u.icon}
                  </Pixel>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      )}

      {/* HUD (game and scores) */}
      {frame >= T.play && frame < T.cont && (
        <div style={{ position: "absolute", left: v ? 40 : 60, right: v ? 40 : 60, top: v ? 110 : 36, display: "flex", justifyContent: "space-between", opacity: interpolate(frame, [T.play, T.play + 8, T.cont - 8, T.cont], [0, 1, 1, 0], clamp) }}>
          <div>
            <Pixel size={v ? 28 : 26} color="#94a3b8">SCORE</Pixel>
            <Pixel size={v ? 44 : 40}>{String(score).padStart(6, "0")}</Pixel>
          </div>
          <div style={{ textAlign: "center" }}>
            <Pixel size={v ? 28 : 26} color="#94a3b8">WORLD</Pixel>
            <Pixel size={v ? 44 : 40} color={GREEN}>ARC-1</Pixel>
          </div>
          <div style={{ textAlign: "right" }}>
            <Pixel size={v ? 28 : 26} color="#94a3b8">LV</Pixel>
            <Pixel size={v ? 44 : 40} color={YELLOW}>{1 + got + (frame >= T.levelUp ? 1 : 0)}</Pixel>
          </div>
        </div>
      )}

      {/* ===== Player count ===== */}
      {frame >= T.scores && frame < T.cont && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: interpolate(frame, [T.cont - 8, T.cont], [1, 0], clamp) }}>
          <div style={{ transform: `translateY(${(1 - scores) * 40}px)`, opacity: scores, display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 30 : 22 }}>
            <Pixel size={v ? 40 : 40} color={YELLOW}>PLAYERS ON ARC</Pixel>
            <Pixel size={v ? 200 : 200} style={{ textShadow: "12px 12px 0 #1e293b" }}>
              {Math.round(interpolate(frame, [T.scores, T.scores + 30], [0, ARC_AGENTS], clamp))}
            </Pixel>
            <Pixel size={v ? 40 : 40} color={GREEN}>{FUCI_AGENTS} FROM FUCI</Pixel>
            <Pixel size={v ? 30 : 30} color="#94a3b8" style={{ marginTop: 10 }}>THE GAME JUST STARTED.</Pixel>
          </div>
        </AbsoluteFill>
      )}

      {/* ===== Continue? ===== */}
      {frame >= T.cont && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ transform: `scale(${0.8 + 0.2 * cont})`, opacity: cont, display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 34 : 24 }}>
            <Pixels rows={runFrame ? SPRITE : SPRITE_RUN} p={v ? 14 : 12} />
            <Pixel size={v ? 90 : 100} color={YELLOW}>
              CONTINUE? {countdown}
            </Pixel>
            <Pixel size={v ? 44 : 44}>
              ▶ SPAWN YOUR AGENT <span style={{ color: GREEN }}>$1</span>
            </Pixel>
            <Pixel size={v ? 38 : 38} color={GREEN}>
              fuci.family · $FUCI
            </Pixel>
          </div>
        </AbsoluteFill>
      )}

      {/* CRT scanlines */}
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(180deg, rgba(0,0,0,0.18) 0 2px, transparent 2px 5px)", pointerEvents: "none" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.55) 100%)", pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
