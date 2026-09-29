import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, F, Frond } from "../theme";

/**
 * 15 s: "Autopilot, upgraded". A sorting machine: new Argus tokens ride a conveyor through five smart-entry
 * gates (dev holding, bundle, socials, organic volume, tax). Rugs get knocked off; one clean token passes
 * and is bought. Then DCA drips $FUCI into a jar on a clock, the PnL card counts up and gets shared, end card.
 * Timed to public/sorter.wav (scripts/sorter.py). No flashing: every light change is a short fade.
 */
export const T = { intro: 0, sort: 44, dca: 232, pnl: 318, end: 396, dur: 450 };
export const SPEED = 24;
export const X0 = -120;
export const GATES = [470, 710, 950, 1190, 1430];
export const TRAY_X = 1690;
export const START = (i: number) => T.sort + 12 + i * 15;
export const AT = (i: number, x: number) => START(i) + (x - X0) / SPEED;
/** Token i fails at gate i; the last one passes every gate. */
export const TOKENS = ["RUGME", "BUNDL", "GHOST", "WASH", "TAXX", "KELP"];
export const DCA_TICKS = 5;
export const DCA_TICK = (k: number) => T.dca + 16 + k * 12;
export const PNL_CLICK = T.pnl + 50;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const G = C.up;
const RED = "#ef4444";
const BELT_Y = 610;
const GATE_LABEL = ["Dev ≤ 4%", "No bundle", "Real social", "Organic volume", "Low tax"];
const FAIL_WHY = ["dev holds 38%", "bundled launch", "no socials", "wash volume", "10% tax"];

const Fade: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [from, from + 10, to - 10, to], [0, 1, 1, 0], clamp);
  if (f < from || f > to) return null;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const Heading: React.FC<{ eyebrow: string; title: string; at: number }> = ({ eyebrow, title, at }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", left: 120, top: 96, opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
      <div style={{ fontFamily: F.mono, fontSize: 22, letterSpacing: 6, color: G }}>{eyebrow}</div>
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 64, color: C.ink, marginTop: 10 }}>{title}</div>
    </div>
  );
};

/** A token coin with its ticker. */
const Coin: React.FC<{ label: string; size?: number; tint?: string; frond?: boolean }> = ({ label, size = 116, tint = "#3a3a3a", frond }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle at 35% 30%, #2b2b2b, #111 70%)`,
      border: `4px solid ${tint}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      boxShadow: "0 10px 24px rgba(0,0,0,0.6)",
    }}
  >
    {frond ? <Frond size={size * 0.42} draw={false} /> : null}
    <div style={{ fontFamily: F.mono, fontWeight: 500, fontSize: size * (frond ? 0.15 : 0.17), color: C.ink, marginTop: frond ? 2 : 0 }}>${label}</div>
  </div>
);

/* ------------------------------------------------------------------ intro */

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const p = interpolate(f, [4, 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const chip = interpolate(f, [16, 28], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity: p, transform: `scale(${0.94 + p * 0.06})`, display: "flex", alignItems: "center", gap: 36 }}>
        <Frond size={150} />
        <div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 120, color: C.ink, lineHeight: 1 }}>Autopilot</div>
          <div
            style={{
              opacity: chip,
              marginTop: 18,
              display: "inline-block",
              padding: "8px 20px",
              borderRadius: 999,
              background: G,
              color: "#04110a",
              fontFamily: F.mono,
              fontWeight: 500,
              fontSize: 30,
              letterSpacing: 4,
            }}
          >
            UPGRADED
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ sorting machine */

const Belt: React.FC = () => {
  const f = useCurrentFrame();
  const shift = (f * SPEED) % 80;
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: BELT_Y + 58, height: 34, background: "#161616", borderTop: `2px solid ${C.line}`, borderBottom: `2px solid ${C.line}`, overflow: "hidden" }}>
        {Array.from({ length: 28 }, (_, i) => (
          <div key={i} style={{ position: "absolute", top: 8, left: i * 80 + shift - 80, width: 40, height: 14, borderRadius: 3, background: "#222" }} />
        ))}
      </div>
      {Array.from({ length: 13 }, (_, i) => (
        <div
          key={i}
          style={{ position: "absolute", top: BELT_Y + 96, left: i * 160 + 40, width: 26, height: 26, borderRadius: "50%", border: `2px solid ${C.line}`, transform: `rotate(${f * 12}deg)` }}
        />
      ))}
    </>
  );
};

/** How lit a gate is: red while it rejects, green briefly as a clean token passes. */
function gateLight(g: number, f: number) {
  const failAt = AT(g, GATES[g] - 60);
  const red = interpolate(f, [failAt, failAt + 4, failAt + 26, failAt + 36], [0, 1, 1, 0], clamp);
  let green = 0;
  for (let i = g + 1; i < TOKENS.length; i++) {
    const at = AT(i, GATES[g] - 58);
    green = Math.max(green, interpolate(f, [at, at + 3, at + 12, at + 20], [0, 1, 1, 0], clamp));
  }
  return { red, green };
}

const Gate: React.FC<{ g: number }> = ({ g }) => {
  const f = useCurrentFrame();
  const { red, green } = gateLight(g, f);
  const col = red > 0.01 ? `rgba(239,68,68,${0.25 + red * 0.75})` : `rgba(34,197,94,${0.25 + green * 0.75})`;
  const x = GATES[g];
  return (
    <>
      <div style={{ position: "absolute", left: x - 80, top: BELT_Y - 150, width: 160, height: 210, border: `5px solid ${col}`, borderBottom: "none", borderRadius: "18px 18px 0 0" }} />
      <div
        style={{
          position: "absolute",
          left: x - 110,
          top: BELT_Y - 214,
          width: 220,
          textAlign: "center",
          fontFamily: F.body,
          fontWeight: 600,
          fontSize: 26,
          color: red > 0.01 ? RED : green > 0.01 ? G : C.ink2,
        }}
      >
        {GATE_LABEL[g]}
      </div>
      <div style={{ position: "absolute", left: x - 9, top: BELT_Y - 176, width: 18, height: 18, borderRadius: "50%", background: col }} />
    </>
  );
};

const Token: React.FC<{ i: number }> = ({ i }) => {
  const f = useCurrentFrame();
  const good = i === TOKENS.length - 1;
  const t = f - START(i);
  if (t < 0) return null;
  let x = X0 + t * SPEED;
  let y = BELT_Y - 58;
  let rot = t * SPEED * 0.5;
  let opacity = 1;
  let ring = "#3a3a3a";
  let stamp: React.ReactNode = null;
  if (!good) {
    const stopX = GATES[i] - 60 - 58;
    const failAt = AT(i, GATES[i] - 60);
    if (f >= failAt) {
      const d = f - failAt;
      x = stopX + 58 - d * 3;
      y = BELT_Y - 58 + d * d * 0.9;
      rot = (stopX + 58 - X0) * 0.5 - d * 9;
      opacity = interpolate(d, [14, 30], [1, 0], clamp);
      ring = RED;
      const w = interpolate(d, [0, 6], [0, 1], clamp);
      stamp = (
        <div style={{ position: "absolute", left: stopX + 58 - 170, top: BELT_Y - 290, width: 340, textAlign: "center", opacity: interpolate(d, [0, 5, 22, 32], [0, 1, 1, 0], clamp) }}>
          <span style={{ fontFamily: F.mono, fontSize: 24, color: RED, background: "rgba(239,68,68,0.12)", border: `1px solid ${RED}`, borderRadius: 999, padding: "6px 14px", transform: `scale(${0.9 + w * 0.1})`, display: "inline-block", whiteSpace: "nowrap" }}>
            ✕ {FAIL_WHY[i]}
          </span>
        </div>
      );
    }
  } else {
    const land = AT(i, TRAY_X);
    if (f >= land) {
      const d = f - land;
      x = TRAY_X - 58;
      y = BELT_Y - 58 - interpolate(d, [0, 10], [0, 40], { ...clamp, easing: Easing.out(Easing.cubic) });
      rot = 0;
      ring = G;
    } else {
      ring = interpolate(f, [AT(i, GATES[0]), AT(i, GATES[4])], [0, 1], clamp) > 0.5 ? G : "#3a3a3a";
    }
  }
  return (
    <>
      {stamp}
      <div style={{ position: "absolute", left: x, top: y, opacity, transform: `rotate(${good && f >= AT(i, TRAY_X) ? 0 : rot % 360}deg)` }}>
        <Coin label={TOKENS[i]} tint={ring} frond={good} />
      </div>
    </>
  );
};

const Tray: React.FC = () => {
  const f = useCurrentFrame();
  const land = AT(TOKENS.length - 1, TRAY_X);
  const p = interpolate(f, [land, land + 10], [0, 1], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: TRAY_X - 100, top: BELT_Y - 160, width: 200, height: 220, borderRadius: 20, border: `3px dashed ${p > 0 ? G : C.line}`, background: `rgba(34,197,94,${p * 0.08})` }} />
      <div style={{ position: "absolute", left: TRAY_X - 140, top: BELT_Y - 214, width: 280, textAlign: "center", fontFamily: F.body, fontWeight: 600, fontSize: 26, color: p > 0 ? G : C.ink2 }}>
        Buy
      </div>
      <div style={{ position: "absolute", left: TRAY_X - 170, top: BELT_Y + 150, width: 340, textAlign: "center", opacity: p }}>
        <span style={{ fontFamily: F.mono, fontSize: 28, color: "#04110a", background: G, borderRadius: 999, padding: "8px 20px" }}>✓ bought 1 USDC</span>
      </div>
    </>
  );
};

const Sort: React.FC = () => {
  const f = useCurrentFrame();
  const checked = TOKENS.filter((_, i) => f >= (i === TOKENS.length - 1 ? AT(i, TRAY_X) : AT(i, GATES[i] - 60))).length;
  const bought = f >= AT(TOKENS.length - 1, TRAY_X) ? 1 : 0;
  return (
    <AbsoluteFill>
      <Heading eyebrow="SMART ENTRY" title="It skips the obvious rugs." at={T.sort} />
      <div style={{ position: "absolute", right: 120, top: 118, fontFamily: F.mono, fontSize: 26, color: C.ink2, textAlign: "right" }}>
        checked <span style={{ color: C.ink }}>{checked}</span> · bought <span style={{ color: G }}>{bought}</span>
      </div>
      <Belt />
      {GATES.map((_, g) => (
        <Gate key={g} g={g} />
      ))}
      <Tray />
      {TOKENS.map((_, i) => (
        <Token key={i} i={i} />
      ))}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ DCA */

const Dca: React.FC = () => {
  const f = useCurrentFrame();
  const cx = 620;
  const cy = 600;
  const r = 190;
  const ticks = Array.from({ length: DCA_TICKS }, (_, k) => k).filter((k) => f >= DCA_TICK(k)).length;
  // The hand moves one hour per tick, easing into each step.
  const step = (k: number) => interpolate(f, [DCA_TICK(k) - 6, DCA_TICK(k)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const hours = Array.from({ length: DCA_TICKS }, (_, k) => step(k)).reduce((a, b) => a + b, 0);
  const angle = hours * 30;
  const jarX = 1300;
  const jarTop = 360;
  const jarH = 440;
  return (
    <AbsoluteFill>
      <Heading eyebrow="DCA" title="Buy $FUCI every hour." at={T.dca} />
      {/* clock */}
      <div style={{ position: "absolute", left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `6px solid ${C.line}`, background: "#0c0c0c" }} />
      {Array.from({ length: 12 }, (_, h) => (
        <div
          key={h}
          style={{ position: "absolute", left: cx - 3, top: cy - r + 14, width: 6, height: 22, borderRadius: 3, background: h % 3 === 0 ? C.ink2 : C.line, transformOrigin: `3px ${r - 14}px`, transform: `rotate(${h * 30}deg)` }}
        />
      ))}
      <div style={{ position: "absolute", left: cx - 5, top: cy - r + 50, width: 10, height: r - 50, borderRadius: 5, background: G, transformOrigin: `5px ${r - 50}px`, transform: `rotate(${angle}deg)` }} />
      <div style={{ position: "absolute", left: cx - 14, top: cy - 14, width: 28, height: 28, borderRadius: "50%", background: G }} />
      <div style={{ position: "absolute", left: cx - 200, top: cy + r + 36, width: 400, textAlign: "center", fontFamily: F.mono, fontSize: 28, color: C.ink2 }}>
        1 USDC · every 1h
      </div>

      {/* jar */}
      <div style={{ position: "absolute", left: jarX - 170, top: jarTop, width: 340, height: jarH, borderRadius: "30px 30px 60px 60px", border: `5px solid ${C.line}`, borderTop: "none", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: interpolate(hours, [0, DCA_TICKS], [0, jarH * 0.62]),
            background: "linear-gradient(to top, rgba(34,197,94,0.28), rgba(34,197,94,0.08))",
          }}
        />
      </div>
      {Array.from({ length: DCA_TICKS }, (_, k) => {
        const d = f - DCA_TICK(k);
        if (d < -8) return null;
        const restY = jarTop + jarH - 110 - k * 58;
        const y = interpolate(d, [-8, 8], [jarTop - 170, restY], { ...clamp, easing: Easing.in(Easing.quad) });
        const o = interpolate(d, [-8, -2], [0, 1], clamp);
        return (
          <div key={k} style={{ position: "absolute", left: jarX - 50 + (k % 2 ? 28 : -28), top: y, opacity: o }}>
            <Coin label="FUCI" size={100} tint={G} frond />
          </div>
        );
      })}
      <div style={{ position: "absolute", left: jarX + 210, top: jarTop + 150, fontFamily: F.mono, fontSize: 30, color: C.ink }}>
        {ticks} <span style={{ color: C.ink2 }}>buys</span>
      </div>
      <div style={{ position: "absolute", left: jarX - 220, top: jarTop + jarH + 40, width: 440, textAlign: "center" }}>
        <span style={{ fontFamily: F.body, fontSize: 28, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 20px", display: "inline-flex", alignItems: "center", gap: 12 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2.2" strokeLinecap="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Keep: never auto-sold
        </span>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ PnL card */

const Pnl: React.FC = () => {
  const f = useCurrentFrame();
  const t = f - T.pnl;
  const up = interpolate(t, [0, 16], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const count = interpolate(t, [10, 38], [0, 3.42], { ...clamp, easing: Easing.out(Easing.cubic) });
  const pct = interpolate(t, [10, 38], [0, 17.1], { ...clamp, easing: Easing.out(Easing.cubic) });
  // Cursor glides to Share, clicks, then the card settles into a post.
  const cur = interpolate(f, [PNL_CLICK - 22, PNL_CLICK - 2], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const press = interpolate(f, [PNL_CLICK, PNL_CLICK + 3, PNL_CLICK + 8], [1, 0.94, 1], clamp);
  const post = interpolate(f, [PNL_CLICK + 8, PNL_CLICK + 26], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cardW = 1100;
  const cardScale = 1 - post * 0.32;
  const cardY = 250 + post * 150;
  return (
    <AbsoluteFill>
      <Heading eyebrow="PNL" title="Proof it works. Share it." at={T.pnl} />
      {/* the X post that frames the card after Share */}
      <div
        style={{
          position: "absolute",
          left: 960 - 440,
          top: 244,
          width: 880,
          height: 640,
          borderRadius: 24,
          border: `2px solid ${C.line}`,
          background: "#0a0a0a",
          opacity: post,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "28px 32px 0" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#161616", border: `2px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Frond size={36} draw={false} />
          </div>
          <div style={{ fontFamily: F.body, fontSize: 26, color: C.ink }}>
            <b>My AI agent</b> <span style={{ color: C.muted }}>@fucidotfamily</span>
            <div style={{ fontSize: 24, color: C.ink2, marginTop: 4 }}>+3.42 USDC on autopilot, trading on Arc by itself.</div>
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 960 - cardW / 2,
          top: cardY,
          width: cardW,
          height: 578,
          opacity: up,
          transform: `translateY(${(1 - up) * 40}px) scale(${cardScale})`,
          transformOrigin: "50% 0%",
          borderRadius: 22,
          border: `2px solid ${C.line}`,
          background: "linear-gradient(120deg, #000 40%, #0d3a1f 100%)",
          padding: "44px 56px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Frond size={40} draw={false} />
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 38, color: C.ink }}>fuci</span>
          </div>
          <span style={{ fontFamily: F.mono, fontSize: 22, letterSpacing: 4, color: C.ink2 }}>AUTOPILOT PNL</span>
        </div>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 40, color: C.ink2, marginTop: 44 }}>Fuci</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 26 }}>
          <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 120, color: G, lineHeight: 1.05 }}>+{count.toFixed(2)} USDC</span>
          <span style={{ fontFamily: F.mono, fontSize: 40, color: G }}>+{pct.toFixed(1)}%</span>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: "auto" }}>
          {[
            ["TRADES", "9"],
            ["BOUGHT", "20.00"],
            ["SOLD + OPEN", "23.42"],
          ].map(([k, v]) => (
            <div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: "#0c0c0c", padding: "14px 22px", minWidth: 180 }}>
              <div style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: 3, color: C.muted }}>{k}</div>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 34, color: C.ink, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Share button, then the cursor */}
      <div style={{ position: "absolute", left: 960 - 130, top: 870, opacity: up * (1 - post), transform: `scale(${press})` }}>
        <div style={{ width: 260, padding: "18px 0", textAlign: "center", borderRadius: 8, background: C.ink, color: "#000", fontFamily: F.display, fontWeight: 700, fontSize: 26, letterSpacing: 3 }}>SHARE ON X</div>
      </div>
      <svg
        width="44"
        height="44"
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: interpolate(cur, [0, 1], [1500, 1000]),
          top: interpolate(cur, [0, 1], [1000, 900]),
          opacity: interpolate(f, [PNL_CLICK - 24, PNL_CLICK - 18, PNL_CLICK + 14, PNL_CLICK + 20], [0, 1, 1, 0], clamp),
        }}
      >
        <path d="M4 2l16 10-7 2 4 8-3 1.5-4-8-6 5z" fill="#fff" stroke="#000" strokeWidth="1.2" />
      </svg>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ end card */

const End: React.FC = () => {
  const f = useCurrentFrame();
  const p = interpolate(f, [T.end, T.end + 18], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const pills = ["Smart entry", "DCA any token", "Trailing stop", "PnL card"];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: p }}>
      <Frond size={140} delay={T.end} />
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 96, color: C.ink, marginTop: 20 }}>fuci.family</div>
      <div style={{ display: "flex", gap: 16, marginTop: 34 }}>
        {pills.map((t, i) => (
          <span
            key={t}
            style={{
              opacity: interpolate(f, [T.end + 12 + i * 5, T.end + 22 + i * 5], [0, 1], clamp),
              fontFamily: F.mono,
              fontSize: 26,
              color: C.ink2,
              border: `1px solid ${C.line}`,
              borderRadius: 999,
              padding: "10px 22px",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ scene */

export const Sorter: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {/* a faint factory-floor grid */}
    <AbsoluteFill
      style={{
        backgroundImage: `linear-gradient(${C.line}55 1px, transparent 1px), linear-gradient(90deg, ${C.line}55 1px, transparent 1px)`,
        backgroundSize: "80px 80px",
        opacity: 0.5,
      }}
    />
    <Fade from={T.intro} to={T.sort + 6}>
      <Intro />
    </Fade>
    <Fade from={T.sort} to={T.dca + 6}>
      <Sort />
    </Fade>
    <Fade from={T.dca} to={T.pnl + 6}>
      <Dca />
    </Fade>
    <Fade from={T.pnl} to={T.end + 6}>
      <Pnl />
    </Fade>
    <Fade from={T.end} to={T.dur + 20}>
      <End />
    </Fade>
  </AbsoluteFill>
);
