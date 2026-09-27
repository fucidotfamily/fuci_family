import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Frond, useVertical } from "../theme";

/** Frame timings, shared with scripts/receipt.py so the sound lands on the picture. */
export const T = {
  printer: 4, // the printer slides in
  print: 34, // first line
  step: 11, // frames per printed row
  tear: 318, // the receipt is torn off
  cta: 368,
};

/** Every ERC-8004 agent on Arc (fuci.family/api/stats/public, 26 Sep 2026). */
const ARC_AGENTS = 287;

/**
 * What one "ask" run buys: the tools in lib/agent.ts PLANS.ask at their lib/tools.ts prices.
 * Rows: [kind, left, right]. "rule" is a dashed line, "gap" an empty row.
 */
type Row = ["title" | "text" | "item" | "total" | "rule" | "gap" | "barcode" | "paid", string?, string?];
const ROWS: Row[] = [
  ["title", "FUCI · AGENT RECEIPT"],
  ["text", "Agent #196 · Arc Mainnet"],
  ["text", "26 SEP 2026  14:02"],
  ["rule"],
  ["text", 'Q: "Which Argus launch'],
  ["text", '    is heating up?"'],
  ["rule"],
  ["item", "Argus Launch Scout", "0.0010"],
  ["item", "Bonding Watcher", "0.0020"],
  ["item", "Tide Oracle", "0.0005"],
  ["rule"],
  ["total", "TOTAL USDC", "0.0035"],
  ["rule"],
  ["item", "Paid via", "x402"],
  ["item", "Settled", "Circle Gateway"],
  ["item", "Network", "Arc"],
  ["item", "API keys", "0"],
  ["item", "Humans", "0"],
  ["gap"],
  ["barcode"],
  ["paid", "PAID ON ARC ✓"],
];
/** The frame each row prints on. Items print a little slower so they can be read. */
const PRINT_AT = ROWS.reduce<number[]>((acc, r, i) => {
  const prev = i === 0 ? T.print - T.step : acc[i - 1];
  const slow = r[0] === "item" || r[0] === "total" ? 3 : 0;
  acc.push(prev + T.step + slow);
  return acc;
}, []);
export const PRINT_FRAMES = PRINT_AT;

const CAPTIONS: [number, React.ReactNode][] = [
  [40, "Your agent needs data."],
  [120, "It pays per call."],
  [195, <>In <b>USDC</b>. On <b>Arc</b>.</>],
  [262, "No API keys. No subscriptions."],
];

const PAPER = "#f6f2e8";
const INK = "#1d1d1b";
const GREEN = "#16a34a";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** A zigzag edge for the torn ends of the paper. */
const zigzag = (w: number, h: number, teeth: number, top: boolean) => {
  const pts: string[] = [];
  for (let i = 0; i <= teeth * 2; i++) {
    const x = (i / (teeth * 2)) * w;
    const y = top ? (i % 2 ? 0 : h) : i % 2 ? h : 0;
    pts.push(`${x},${y}`);
  }
  return pts.join(" ");
};

/**
 * 15 s: "Receipt". A thermal printer prints what an AI agent bought over x402 on Arc, line by line,
 * then the receipt is torn off: total 0.0035 USDC, no API keys, no humans.
 * Sound: public/receipt.wav from scripts/receipt.py.
 */
export const Receipt: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const v = useVertical();

  const paperW = v ? 760 : 600;
  const rowH = v ? 50 : 40;
  const fs = v ? 32 : 26;
  const padX = v ? 44 : 36;
  const printerW = paperW + 120;
  const printerH = v ? 120 : 100;
  const baseX = v ? (width - printerW) / 2 : width * 0.3 - printerW / 2;
  const slotY = (v ? 420 : 90) + printerH - 24;

  const printed = PRINT_AT.filter((f) => frame >= f).length;
  // The newest row slides out of the slot.
  const lastAt = PRINT_AT[Math.max(0, printed - 1)];
  const feed = printed === 0 ? 0 : interpolate(frame, [lastAt, lastAt + 6], [0, 1], clamp);
  const paperH = printed === 0 ? 0 : 22 + (printed - 1 + feed) * rowH + 18;
  // Keep the newest row on screen: move printer and paper up together.
  const maxBottom = height - (v ? 300 : 90);
  const lift = Math.max(0, slotY + paperH - maxBottom);

  const tear = spring({ frame: frame - T.tear, fps, config: { damping: 14 } });
  const torn = frame >= T.tear;
  const printerOut = interpolate(frame, [T.tear, T.tear + 16], [0, 1], { ...clamp, easing: (t) => t * t });
  // After the tear: the receipt floats to the middle of its column, tilted a little.
  const fullH = 22 + ROWS.length * rowH + 10;
  const fit = Math.min(1, (height * (v ? 0.34 : 0.86)) / fullH);
  const restY = v ? 150 : (height - fullH * fit) / 2;
  const paperTop = slotY - lift;
  const y = torn ? interpolate(tear, [0, 1], [paperTop, restY]) : paperTop;
  const s = torn ? interpolate(tear, [0, 1], [1, fit]) : 1;
  const rot = torn ? tear * (v ? -2 : -3) : 0;
  const ctaIn = spring({ frame: frame - T.cta, fps, config: { damping: 15 } });
  const shiftV = 0;
  const paperFade = 1;

  const caption = [...CAPTIONS].reverse().find(([at]) => frame >= at);
  const capAt = caption?.[0] ?? 0;
  const capA = caption ? interpolate(frame, [capAt, capAt + 10], [0, 1], clamp) * interpolate(frame, [T.tear - 10, T.tear], [1, 0], clamp) : 0;

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 40% 30%, #2a2622 0%, #151311 55%, #0b0a09 100%)", overflow: "hidden" }}>
      {/* Warm lamp pool */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${v ? "50% 40%" : "30% 45%"}, rgba(255,210,150,0.12), transparent 45%)` }} />

      {/* The paper */}
      <div
        style={{
          position: "absolute",
          left: baseX + 60,
          top: 0,
          width: paperW,
          transformOrigin: "top center",
          transform: `translateY(${y + shiftV}px) scale(${s}) rotate(${rot}deg)`,
          opacity: paperFade,
          filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.55))",
        }}
      >
        {torn && (
          <svg width={paperW} height={14} style={{ display: "block" }}>
            <polygon points={zigzag(paperW, 14, 30, true)} fill={PAPER} />
          </svg>
        )}
        <div
          style={{
            background: PAPER,
            height: torn ? fullH : paperH,
            overflow: "hidden",
            padding: `22px ${padX}px 0`,
            color: INK,
            fontFamily: F.mono,
            fontSize: fs,
            backgroundImage: "repeating-linear-gradient(180deg, rgba(0,0,0,0.018) 0 2px, transparent 2px 4px)",
          }}
        >
          {ROWS.map((r, i) => {
            if (i >= printed) return null;
            const [kind, a, b] = r;
            const style: React.CSSProperties = { height: rowH, display: "flex", alignItems: "center", whiteSpace: "pre" };
            if (kind === "rule") return <div key={i} style={{ ...style, borderTop: `3px dashed ${INK}`, height: 0, margin: `${rowH / 2}px 0 ${rowH / 2}px` }} />;
            if (kind === "gap") return <div key={i} style={style} />;
            if (kind === "title") return <div key={i} style={{ ...style, justifyContent: "center", fontWeight: 500, letterSpacing: 3 }}>{a}</div>;
            if (kind === "text") return <div key={i} style={{ ...style, color: "#3b3a36" }}>{a}</div>;
            if (kind === "item")
              return (
                <div key={i} style={{ ...style, justifyContent: "space-between" }}>
                  <span>{a}</span>
                  <span>{b}</span>
                </div>
              );
            if (kind === "total")
              return (
                <div key={i} style={{ ...style, justifyContent: "space-between", fontWeight: 500, fontSize: fs * 1.18 }}>
                  <span>{a}</span>
                  <span>{b}</span>
                </div>
              );
            if (kind === "barcode")
              return (
                <div key={i} style={{ ...style, justifyContent: "center" }}>
                  <svg width={paperW * 0.7} height={rowH * 0.9}>
                    {Array.from({ length: 64 }, (_, k) => {
                      const w = 1 + (((k * 7919) % 5) % 3);
                      return <rect key={k} x={(k / 64) * paperW * 0.7} y={0} width={w * 1.6} height={rowH * 0.9} fill={INK} />;
                    })}
                  </svg>
                </div>
              );
            return (
              <div key={i} style={{ ...style, justifyContent: "center", color: GREEN, fontWeight: 500, letterSpacing: 4, fontSize: fs * 1.2 }}>
                {a}
              </div>
            );
          })}
        </div>
        {torn && (
          <svg width={paperW} height={14} style={{ display: "block" }}>
            <polygon points={zigzag(paperW, 14, 30, false)} fill={PAPER} />
          </svg>
        )}
      </div>

      {/* The printer */}
      <div style={{ position: "absolute", left: baseX, top: (v ? 420 : 90) - lift, width: printerW, height: printerH, transform: `translateY(${interpolate(frame, [0, T.printer + 14], [-260, 0], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 }) - printerOut * 1000}px)` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 22, background: "linear-gradient(180deg, #3a3835, #1f1e1c)", boxShadow: "0 20px 50px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.08)" }} />
        <div style={{ position: "absolute", left: 40, right: 40, bottom: 18, height: 12, borderRadius: 6, background: "#050505" }} />
        <div style={{ position: "absolute", left: 30, top: 22, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: GREEN, boxShadow: `0 0 ${10 + 6 * Math.sin(frame / 6)}px ${GREEN}` }} />
          <div style={{ fontFamily: F.mono, fontSize: v ? 20 : 17, letterSpacing: 3, color: "#b9b4aa" }}>FUCI AGENT #196 · PRINTING</div>
        </div>
      </div>

      {/* Captions */}
      {caption && (
        <div
          style={{
            position: "absolute",
            left: v ? 60 : width * 0.56,
            right: v ? 60 : 90,
            top: v ? 150 : "42%",
            textAlign: v ? "center" : "left",
            fontFamily: F.display,
            fontWeight: 600,
            fontSize: v ? 62 : 76,
            lineHeight: 1.08,
            letterSpacing: -1.5,
            color: "#f6f2e8",
            opacity: capA,
            transform: `translateY(${(1 - capA) * 14}px)`,
          }}
        >
          {caption[1]}
        </div>
      )}

      {/* Call to action */}
      {frame >= T.cta && (
        <div
          style={{
            position: "absolute",
            left: v ? 0 : width * 0.54,
            right: v ? 0 : 80,
            top: v ? undefined : 0,
            bottom: v ? 0 : 0,
            height: v ? "62%" : undefined,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: v ? "center" : "flex-start",
            textAlign: v ? "center" : "left",
            gap: v ? 24 : 22,
            padding: v ? "0 50px" : 0,
            opacity: ctaIn,
            transform: `translateY(${(1 - ctaIn) * 26}px)`,
          }}
        >
          <Frond size={v ? 100 : 86} draw={false} />
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 92 : 90, letterSpacing: -2.5, color: "#fff", lineHeight: 1.02 }}>
            Your agent pays
            <br />
            its <span style={{ color: "#4ade80" }}>own way</span>.
          </div>
          <div style={{ fontFamily: F.body, fontSize: v ? 38 : 34, color: "#d6d1c7" }}>
            Spawn one on Arc for <b style={{ color: "#4ade80" }}>$1</b>.
          </div>
          <div style={{ fontFamily: F.mono, fontSize: v ? 28 : 24, color: "#9c978d", letterSpacing: 2 }}>{ARC_AGENTS} AI AGENTS ON ARC SO FAR</div>
          <div style={{ fontFamily: F.mono, fontSize: v ? 36 : 32, color: "#4ade80", letterSpacing: 2 }}>fuci.family · $FUCI</div>
        </div>
      )}
    </AbsoluteFill>
  );
};
