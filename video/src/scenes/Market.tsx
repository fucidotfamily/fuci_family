import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Frond, useVertical } from "../theme";

/** Frame timings, shared with scripts/board.py so the sound lands on the picture. */
export const T = {
  title: 6, // "EVERY PAID API ON ARC"
  titleOut: 58,
  board: 62,
  rows: 74, // + i * ROW_GAP
  rowGap: 11,
  live: 18, // after a row starts, its status flips to LIVE
  stats: 182,
  search: 250,
  pick: 272,
  pay: [282, 298, 314], // 402 → paid → 200 OK
  finale: 334,
};

const AMBER = "#ffb81c";
const GREEN = "#22c55e";
const CELL_BG = "#161616";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$.#/";

/** Real listings on fuci.family/market when this clip was made. */
const ROWS: [string, string, string][] = [
  ["ARGUS LAUNCH SCOUT", "FUCI", "$0.001"],
  ["MARKET PRICES", "CRA AGENT", "$0.002"],
  ["WEB SEARCH", "EXA", "$0.007"],
  ["ARC POOLS", "APEX FAUCET", "$0.025"],
  ["WALLET TRUST", "INSUMER", "$0.15"],
  ["IP GEOLOCATION", "IP402", "$0.01"],
  ["WIKI SEARCH", "CRA AGENT", "$0.001"],
  ["AGENT WATCH", "APEX", "$0.004"],
];
/** Shorter names for the portrait board. */
const ROWS_SHORT: [string, string, string][] = [
  ["LAUNCH SCOUT", "FUCI", "$0.001"],
  ["MARKET PRICES", "CRA", "$0.002"],
  ["WEB SEARCH", "EXA", "$0.007"],
  ["ARC POOLS", "APEX", "$0.025"],
  ["WALLET TRUST", "INSUMER", "$0.15"],
  ["IP GEO", "IP402", "$0.01"],
  ["WIKI SEARCH", "CRA", "$0.001"],
  ["AGENT WATCH", "APEX", "$0.004"],
];
const PICK = 2; // WEB SEARCH

const rnd = (i: number) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * One split-flap cell: cycles through glyphs, then lands on `ch` at `settle`.
 * Each change squashes the top half, like a flap falling.
 */
const Flap: React.FC<{ ch: string; settle: number; start: number; w: number; h: number; color?: string; seed: number; bg?: string }> = ({ ch, settle, start, w, h, color = AMBER, seed, bg = CELL_BG }) => {
  const frame = useCurrentFrame();
  const flipping = frame >= start && frame < settle;
  const step = Math.floor(frame / 2);
  const shown = frame < start ? " " : flipping ? GLYPHS[Math.floor(rnd(seed * 31 + step) * GLYPHS.length)] : ch;
  const phase = flipping ? (frame % 2) / 2 : 1;
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: 4,
        background: bg,
        boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.04)",
        overflow: "hidden",
        flex: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: F.mono,
          fontWeight: 500,
          fontSize: h * 0.7,
          color,
          transform: `scaleY(${flipping ? 0.55 + 0.45 * phase : 1})`,
          textShadow: color === GREEN ? `0 0 ${h * 0.25}px rgba(34,197,94,0.6)` : `0 0 ${h * 0.2}px rgba(255,184,28,0.35)`,
        }}
      >
        {shown}
      </div>
      {/* The hinge */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, marginTop: -1, background: "rgba(0,0,0,0.85)" }} />
    </div>
  );
};

/** A run of flap cells for `text`, padded to `len`, settling left to right from `at`. */
const FlapText: React.FC<{ text: string; len: number; at: number; w: number; h: number; gap: number; color?: string; seed: number; spin?: number; bg?: string }> = ({ text, len, at, w, h, gap, color, seed, spin = 12, bg }) => {
  const chars = text.padEnd(len, " ").slice(0, len).split("");
  return (
    <div style={{ display: "flex", gap }}>
      {chars.map((c, i) => (
        <Flap key={i} ch={c} start={at + i * 0.35} settle={at + i * 0.35 + spin + Math.floor(rnd(seed + i) * 6)} w={w} h={h} color={color} seed={seed * 100 + i} bg={bg} />
      ))}
    </div>
  );
};

/**
 * 13 s: Fuci Market as an airport departures board. Paid APIs on Arc flip in like flights and go LIVE,
 * an agent searches, pays over x402 and gets its answer. Sound: public/board.wav from scripts/board.py.
 */
export const Market: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const v = useVertical();

  // Column widths in cells.
  const cols = v ? { api: 13, seller: 7, price: 6, status: 0 } : { api: 18, seller: 12, price: 7, status: 6 };
  const total = cols.api + cols.seller + cols.price + cols.status;
  const gap = 4;
  const colGap = v ? 16 : 26;
  const boardW = width - (v ? 70 : 160);
  const cw = Math.floor((boardW - gap * total - colGap * 3) / total);
  const ch = Math.round(cw * (v ? 1.6 : 1.45));

  const titleA = interpolate(frame, [T.titleOut, T.titleOut + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const boardIn = spring({ frame: frame - T.board, fps, config: { damping: 18 } });
  const boardOut = interpolate(frame, [T.finale - 12, T.finale - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const searchIn = spring({ frame: frame - T.search, fps, config: { damping: 16 } });
  const query = "web search";
  const typed = query.slice(0, Math.max(0, Math.min(query.length, Math.floor((frame - T.search - 4) / 1.6))));
  const picked = frame >= T.pick;
  const finale = spring({ frame: frame - T.finale, fps, config: { damping: 14 } });

  const header = (label: string, n: number) => (
    <div style={{ width: n * cw + (n - 1) * gap, fontFamily: F.mono, fontSize: v ? 22 : 20, letterSpacing: 4, color: "#8a8a8a" }}>{label}</div>
  );

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, #1a1408 0%, #070707 55%, #030303 100%)", overflow: "hidden" }}>
      {/* Faint scanlines */}
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 4px)" }} />

      {/* 1. Opening line */}
      {frame < T.titleOut + 10 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: titleA }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <FlapText text={v ? "EVERY PAID API" : "EVERY PAID API ON ARC"} len={v ? 14 : 21} at={T.title} w={v ? 62 : 70} h={v ? 94 : 104} gap={6} seed={1} spin={16} />
            {v && <FlapText text="ON ARC" len={6} at={T.title + 8} w={62} h={94} gap={6} seed={2} spin={16} />}
          </div>
        </AbsoluteFill>
      )}

      {/* 2. The departures board */}
      {frame >= T.board - 2 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: v ? "flex-start" : "center", paddingTop: v ? 300 : 0, opacity: boardIn * boardOut }}>
          <div style={{ transform: `translateY(${(1 - boardIn) * 40 + (frame >= T.search ? -searchIn * (v ? 0 : 40) : 0)}px)` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: F.display, fontWeight: 700, fontSize: v ? 44 : 40, color: "#f5f5f5", letterSpacing: 1 }}>
                <span style={{ fontSize: v ? 44 : 40 }}>✈</span> DEPARTURES · PAID APIs ON ARC
              </div>
              {!v && <div style={{ fontFamily: F.mono, fontSize: 20, color: "#8a8a8a", letterSpacing: 3 }}>x402 · USDC · PER CALL</div>}
            </div>
            <div style={{ display: "flex", gap: colGap, marginBottom: 10 }}>
              {header("API", cols.api)}
              {header("SELLER", cols.seller)}
              {header("PRICE", cols.price)}
              {cols.status > 0 && header("STATUS", cols.status)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: v ? 14 : 10 }}>
              {(v ? ROWS_SHORT : ROWS).map(([api, seller, price], i) => {
                const at = T.rows + i * T.rowGap;
                const hot = picked && i === PICK;
                const dim = picked && i !== PICK;
                const bg = hot ? "#1f2a12" : CELL_BG;
                return (
                  <div
                    key={api}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: colGap,
                      opacity: dim ? 0.35 : 1,
                      outline: hot ? `2px solid ${GREEN}` : "none",
                      outlineOffset: 6,
                      borderRadius: 6,
                    }}
                  >
                    <FlapText text={api} len={cols.api} at={at} w={cw} h={ch} gap={gap} seed={10 + i * 7} bg={bg} />
                    <FlapText text={seller} len={cols.seller} at={at + 3} w={cw} h={ch} gap={gap} seed={40 + i * 7} bg={bg} />
                    <FlapText text={price.padStart(cols.price, " ")} len={cols.price} at={at + 5} w={cw} h={ch} gap={gap} seed={70 + i * 7} bg={bg} />
                    {cols.status > 0 ? (
                      <FlapText text="LIVE ✓" len={cols.status} at={at + T.live} w={cw} h={ch} gap={gap} color={GREEN} seed={90 + i * 7} bg={bg} />
                    ) : (
                      <div style={{ width: 14, height: 14, borderRadius: 7, background: frame >= at + T.live ? GREEN : "#333", boxShadow: frame >= at + T.live ? `0 0 12px ${GREEN}` : "none" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Totals strip */}
            <div style={{ marginTop: v ? 34 : 26, display: "flex", flexWrap: "wrap", gap: v ? 18 : 30, alignItems: "center" }}>
              {(
                [
                  ["54", "PAID APIs"],
                  ["10", "SELLERS"],
                  ["$0.0005", "FROM"],
                ] as const
              ).map(([n, label], k) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {k === 2 && <span style={{ fontFamily: F.mono, fontSize: v ? 24 : 22, color: "#8a8a8a", letterSpacing: 3 }}>{label}</span>}
                  <FlapText text={n} len={n.length} at={T.stats + k * 8} w={v ? 40 : 38} h={v ? 60 : 56} gap={4} seed={200 + k * 13} spin={14} />
                  {k < 2 && <span style={{ fontFamily: F.mono, fontSize: v ? 24 : 22, color: "#8a8a8a", letterSpacing: 3 }}>{label}</span>}
                </div>
              ))}
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* 3. An agent searches, pays, gets its answer */}
      {frame >= T.search && frame < T.finale && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: v ? 330 : 60,
            transform: `translateX(-50%) translateY(${(1 - searchIn) * 60}px)`,
            opacity: searchIn * boardOut,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            width: v ? 940 : 1400,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "16px 24px", borderRadius: 14, background: "#0f0f0f", border: "1.5px solid #333", fontFamily: F.mono, fontSize: v ? 32 : 30, color: "#f5f5f5" }}>
            <span style={{ color: "#8a8a8a" }}>agent ›</span>
            <span>
              market_search(&quot;{typed}&quot;)
              <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0.2 }}>▍</span>
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: v ? "column" : "row", alignItems: "center", justifyContent: "center", gap: 16 }}>
            {(
              [
                ["402 PAYMENT REQUIRED", "#ffb81c"],
                ["PAID $0.007 USDC ON ARC", GREEN],
                ["200 OK ✓ RESULTS IN", GREEN],
              ] as const
            ).map(([label, color], k) => {
              const s = Math.min(1, spring({ frame: frame - T.pay[k], fps, config: { damping: 14, stiffness: 180 } }));
              return (
                <span
                  key={label}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 999,
                    border: `2px solid ${color}`,
                    color,
                    background: "rgba(0,0,0,0.6)",
                    fontFamily: F.mono,
                    fontWeight: 500,
                    fontSize: v ? 26 : 24,
                    letterSpacing: 2,
                    transform: `scale(${s})`,
                    opacity: s,
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Finale */}
      {frame >= T.finale && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: interpolate(frame, [T.finale, T.finale + 6], [0, 1], { extrapolateRight: "clamp" }) }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 26 : 22 }}>
            <div style={{ opacity: finale, transform: `scale(${0.7 + 0.3 * finale})` }}>
              <Frond size={v ? 120 : 100} draw={false} />
            </div>
            <FlapText text="FUCI MARKET" len={11} at={T.finale} w={v ? 80 : 96} h={v ? 120 : 144} gap={8} seed={300} spin={14} />
            <div style={{ fontFamily: F.body, fontSize: v ? 38 : 36, color: "#e5e5e5", textAlign: "center", opacity: interpolate(frame, [T.finale + 20, T.finale + 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              Every paid API on Arc. Checked live. Pay per call.
            </div>
            <div style={{ fontFamily: F.mono, fontSize: v ? 34 : 32, color: AMBER, letterSpacing: 2, opacity: interpolate(frame, [T.finale + 30, T.finale + 42], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              fuci.family/market
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
