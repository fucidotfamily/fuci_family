import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, useVertical } from "../theme";
import DATA from "./terminal-data.json";

/**
 * 15 s: "Agents paying right now". A terminal tails Fuci's live x402 payments (a real snapshot from
 * /api/stats: time UTC, paying wallet, tool, price) while counters tick up to the real totals, then an
 * end card. Timed to public/terminal.wav (scripts/terminal.py). No flashing: the cursor is steady.
 */
export const T = { typeStart: 14, typeEnd: 50, lines: 64, gap: 21, end: 342, dur: 450 };
export const LINE_AT = (i: number) => T.lines + i * T.gap;

type Line = { t: string; who: string; tool: string; usdc: number };
const LINES = DATA.lines as Line[];
const G = C.up;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const COMMAND = "fuci watch --payments --live";
const sumUsdc = LINES.reduce((s, l) => s + l.usdc, 0);

const Counter: React.FC<{ label: string; from: number; to: number; digits: number; prefix?: string; frame: number }> = ({ label, from, to, digits, prefix = "", frame }) => {
  // Each settled line adds its share; the counter lands on the real total with the last line.
  const done = LINES.filter((_, i) => frame >= LINE_AT(i) + 6).length;
  const v = from + ((to - from) * done) / LINES.length;
  return (
    <div style={{ padding: "22px 26px", borderRadius: 16, border: "1px solid #1f3326", background: "rgba(8,18,12,0.8)" }}>
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 64, letterSpacing: -2, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
        {prefix}
        {v.toFixed(digits)}
      </div>
      <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: 3, color: "#8aa594", marginTop: 4 }}>{label}</div>
    </div>
  );
};

export const Terminal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const v = useVertical();
  const open = spring({ frame, fps, config: { damping: 20 } });
  const out = interpolate(frame, [T.end - 14, T.end + 4], [1, 0], clamp);
  const typed = COMMAND.slice(0, Math.floor(interpolate(frame, [T.typeStart, T.typeEnd], [0, COMMAND.length], clamp)));
  const visible = LINES.map((l, i) => ({ l, i, a: interpolate(frame, [LINE_AT(i), LINE_AT(i) + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }) })).filter((x) => x.a > 0);
  const termW = v ? width - 100 : 1180;
  const rows = v ? 9 : 10;
  const shownLines = visible.slice(-rows);

  return (
    <AbsoluteFill style={{ background: "radial-gradient(1200px 800px at 30% 30%, #0b1a10 0%, #030604 60%, #000 100%)" }}>
      {/* faint grid, static */}
      <AbsoluteFill
        style={{
          opacity: 0.25,
          backgroundImage: "linear-gradient(rgba(34,197,94,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,.08) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, #000 30%, transparent 80%)",
        }}
      />
      <AbsoluteFill style={{ opacity: out }}>
        <div
          style={{
            position: "absolute",
            left: v ? 50 : 70,
            top: v ? 170 : (height - 760) / 2,
            width: termW,
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid #1f3326",
            background: "rgba(4,10,6,0.92)",
            boxShadow: "0 40px 120px rgba(0,0,0,0.7)",
            transform: `translateY(${(1 - open) * 30}px)`,
            opacity: open,
          }}
        >
          <div style={{ height: 56, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", borderBottom: "1px solid #16241b", background: "#07100a" }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />
            ))}
            <div style={{ marginLeft: 16, fontFamily: F.mono, fontSize: 20, color: "#7f9a88" }}>fuci.family · x402 payments · Arc mainnet</div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontFamily: F.mono, fontSize: 18, letterSpacing: 3, color: G }}>
              <div style={{ width: 11, height: 11, borderRadius: 6, background: G, boxShadow: `0 0 12px ${G}` }} />
              LIVE
            </div>
          </div>
          <div style={{ padding: v ? "26px 26px 30px" : "28px 34px 34px", fontFamily: F.mono, fontSize: v ? 25 : 27, lineHeight: 1.55, color: "#cfe3d6", minHeight: v ? 820 : 640 }}>
            <div>
              <span style={{ color: G }}>$ </span>
              {typed}
              {frame < T.lines && <span style={{ display: "inline-block", width: 14, height: 30, background: G, marginLeft: 4, verticalAlign: "middle" }} />}
            </div>
            {frame >= T.typeEnd + 4 && <div style={{ color: "#6f8a78" }}>watching settled payments…</div>}
            {shownLines.map(({ l, i, a }) => (
              <div key={i} style={{ opacity: a, transform: `translateX(${(1 - a) * 24}px)`, display: v ? "block" : "flex", gap: 18, whiteSpace: "nowrap" }}>
                <span style={{ color: "#6f8a78" }}>{l.t}</span>
                {v ? " " : null}
                <span style={{ color: l.who === "house agent" ? "#9fd3b0" : "#7dd3fc", width: v ? undefined : 190, display: "inline-block" }}>{l.who}</span>
                {v ? <br /> : null}
                <span style={{ color: C.ink, width: v ? undefined : 350, display: "inline-block" }}>→ {l.tool}</span>
                {v ? " " : null}
                <span style={{ color: G, width: v ? undefined : 200, display: "inline-block" }}>{l.usdc} USDC</span>
                {v ? " " : null}
                <span style={{ color: "#6f8a78" }}>✓ settled</span>
              </div>
            ))}
          </div>
        </div>
        {/* counters */}
        <div
          style={{
            position: "absolute",
            right: v ? 50 : 70,
            left: v ? 50 : undefined,
            top: v ? height - 560 : (height - 760) / 2,
            width: v ? undefined : 560,
            display: "flex",
            flexDirection: v ? "row" : "column",
            gap: 18,
            opacity: interpolate(frame, [T.lines - 10, T.lines + 10], [0, 1], clamp),
          }}
        >
          <div style={{ flex: 1 }}>
            <Counter label="X402 CALLS PAID" from={DATA.calls - LINES.length} to={DATA.calls} digits={0} frame={frame} />
          </div>
          <div style={{ flex: 1 }}>
            <Counter label="USDC SETTLED" from={DATA.usdc - sumUsdc} to={DATA.usdc} digits={3} prefix="$" frame={frame} />
          </div>
          {!v && (
            <div style={{ padding: "22px 26px", borderRadius: 16, border: "1px solid #1f3326", background: "rgba(8,18,12,0.8)" }}>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 64, letterSpacing: -2, color: C.ink }}>0</div>
              <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: 3, color: "#8aa594", marginTop: 4 }}>API KEYS NEEDED</div>
            </div>
          )}
        </div>
      </AbsoluteFill>
      <End v={v} />
    </AbsoluteFill>
  );
};

const End: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < T.end - 6) return null;
  const a = spring({ frame: frame - T.end, fps, config: { damping: 18 } });
  const b = spring({ frame: frame - (T.end + 18), fps, config: { damping: 18 } });
  const fade = interpolate(frame, [T.dur - 14, T.dur - 1], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 90px", opacity: fade }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 24}px)`, fontFamily: F.display, fontWeight: 700, fontSize: v ? 96 : 112, lineHeight: 1.02, letterSpacing: -4, color: C.ink }}>
        While you slept,
        <br />
        <span style={{ color: G }}>agents kept paying.</span>
      </div>
      <div style={{ marginTop: 40, opacity: b, transform: `translateY(${(1 - b) * 16}px)`, fontFamily: F.mono, fontSize: v ? 32 : 36, color: "#cfe3d6" }}>
        {DATA.calls} paid calls · ${DATA.usdc.toFixed(2)} settled · no API keys
      </div>
      <div style={{ marginTop: 22, opacity: b, fontFamily: F.mono, fontSize: v ? 40 : 44, color: C.ink }}>fuci.family</div>
    </AbsoluteFill>
  );
};
