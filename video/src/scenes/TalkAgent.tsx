import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/fonts";

/**
 * 15 s: "Just tell your agent." Fuci's chat takes orders in plain words: each message becomes an action card,
 * the owner confirms, it's done. A deliberately different look from the dark studio films: bright pastel
 * "sticker" style (neo-brutalist: thick black outlines, hard offset shadows, bouncy stickers), a new display
 * face (Bricolage Grotesque, OFL) and a background colour per command. Timed to public/talk.wav
 * (scripts/talk.py). No flashing: colours cross-fade, stickers spring in.
 */
for (const w of ["600", "800"]) void loadFont({ family: "Bricolage", url: staticFile(`fonts/bricolage-grotesque-latin-${w}-normal.woff2`), weight: w });
void loadFont({ family: "Inter", url: staticFile("fonts/inter-latin-500-normal.woff2"), weight: "500" });
void loadFont({ family: "Inter", url: staticFile("fonts/inter-latin-600-normal.woff2"), weight: "600" });

const D = "Bricolage, sans-serif";
const B = "Inter, sans-serif";
const INK = "#141414";

export const T = { title: 0, first: 70, step: 80, end: 390, dur: 450 };
/** Frames inside one command: typing, send, card, confirm tap, done, slide out. */
export const STEP = { type: 0, typeEnd: 22, send: 24, card: 34, tap: 54, done: 60, out: 76 };

export const COMMANDS = [
  { say: "DCA $FUCI 2 USDC every hour", tag: "DCA", title: "Buy $FUCI every hour", detail: "2 USDC per buy · autopilot on", done: "Plan saved. First buy in 5 min.", bg: "#d9ccff" },
  { say: "Sell half my FUCI", tag: "SELL", title: "Sell 50% of FUCI", detail: "At market · 1% fee", done: "Sold. USDC is back in the wallet.", bg: "#ffd2b8" },
  { say: "Put all my idle USDC in Earn", tag: "EARN", title: "Deposit idle USDC in Earn", detail: "Best USDC vault · withdraw any time", done: "Deposited. It's earning now.", bg: "#bdf2d5" },
  { say: "Turn autopilot off", tag: "PAUSE", title: "Stop the autopilot", detail: "Positions stay open", done: "Autopilot is off.", bg: "#c4e3ff" },
];
const TITLE_BG = "#fff1a8";
export const at = (i: number) => T.first + i * T.step;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const inOut = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });

const usePop = (start: number) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - start, fps, config: { damping: 11, stiffness: 160, mass: 0.7 } });
};

const Sticker: React.FC<{ bg: string; children: React.ReactNode; style?: React.CSSProperties; rotate?: number; pop: number }> = ({ bg, children, style, rotate = 0, pop }) => (
  <div
    style={{
      position: "absolute",
      padding: "14px 28px",
      borderRadius: 22,
      background: bg,
      border: `4px solid ${INK}`,
      boxShadow: `8px 8px 0 ${INK}`,
      fontFamily: D,
      fontWeight: 800,
      color: INK,
      transform: `scale(${pop}) rotate(${rotate}deg)`,
      opacity: Math.min(1, pop * 2),
      ...style,
    }}
  >
    {children}
  </div>
);

/** Background: the colour of the current command, cross-faded, with two soft blobs. */
const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const layers = [TITLE_BG, ...COMMANDS.map((c) => c.bg), TITLE_BG];
  const starts = [0, ...COMMANDS.map((_, i) => at(i) - 8), T.end - 8];
  return (
    <AbsoluteFill>
      {layers.map((c, i) => (
        <AbsoluteFill key={i} style={{ background: c, opacity: i === 0 ? 1 : inOut(f, starts[i], starts[i] + 16) }} />
      ))}
      <div style={{ position: "absolute", left: -160 + Math.sin(f / 50) * 20, top: 620, width: 620, height: 620, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }} />
      <div style={{ position: "absolute", right: -120, top: -140 + Math.cos(f / 60) * 20, width: 520, height: 520, borderRadius: "50%", background: "rgba(255,255,255,0.3)" }} />
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(rgba(20,20,20,0.10) 2px, transparent 2.4px)`, backgroundSize: "34px 34px" }} />
    </AbsoluteFill>
  );
};

/** Title: three stickers bounce in. */
const Title: React.FC = () => {
  const f = useCurrentFrame();
  const a = usePop(4);
  const b = usePop(14);
  const c = usePop(24);
  const out = 1 - inOut(f, T.first - 12, T.first + 2);
  if (out <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Sticker bg="#fff" pop={a} rotate={-4} style={{ left: 330, top: 250, fontSize: 150 }}>
        Just
      </Sticker>
      <Sticker bg="#ff8fb1" pop={b} rotate={3} style={{ left: 760, top: 300, fontSize: 150 }}>
        tell
      </Sticker>
      <Sticker bg="#8fe3b0" pop={c} rotate={-2} style={{ left: 520, top: 560, fontSize: 150 }}>
        your agent.
      </Sticker>
    </AbsoluteFill>
  );
};

/** One command's messages inside the phone. */
const Exchange: React.FC<{ i: number }> = ({ i }) => {
  const f = useCurrentFrame();
  const s = at(i);
  const c = COMMANDS[i];
  const bubble = usePop(s + STEP.send);
  const card = usePop(s + STEP.card);
  const done = usePop(s + STEP.done);
  const outY = inOut(f, s + STEP.out, s + STEP.out + 10);
  const tapped = f >= s + STEP.tap;
  if (f < s + STEP.send || outY >= 1) return null;
  return (
    <div style={{ position: "absolute", inset: "0 22px", transform: `translateY(${outY * -520}px)`, opacity: 1 - outY }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 40 }}>
        <div style={{ maxWidth: 330, padding: "16px 20px", borderRadius: "24px 24px 6px 24px", background: INK, color: "#fff", fontFamily: B, fontWeight: 500, fontSize: 24, lineHeight: 1.3, transform: `scale(${bubble})`, transformOrigin: "right bottom" }}>
          {c.say}
        </div>
      </div>
      <div style={{ marginTop: 22, padding: 20, borderRadius: 22, background: "#fff", border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}`, transform: `scale(${card})`, transformOrigin: "left top" }}>
        <p style={{ margin: 0, fontFamily: B, fontWeight: 600, fontSize: 14, letterSpacing: 2, color: "#6b6b6b" }}>YOUR AGENT WILL</p>
        <p style={{ margin: "6px 0 0", fontFamily: D, fontWeight: 800, fontSize: 30, color: INK, lineHeight: 1.1 }}>{c.title}</p>
        <p style={{ margin: "6px 0 0", fontFamily: B, fontWeight: 500, fontSize: 18, color: "#555" }}>{c.detail}</p>
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <div style={{ padding: "10px 20px", borderRadius: 12, background: tapped ? "#1faa59" : INK, color: "#fff", fontFamily: B, fontWeight: 600, fontSize: 18, transform: `scale(${f >= s + STEP.tap && f < s + STEP.tap + 4 ? 0.92 : 1})` }}>
            {tapped ? "✓ Confirmed" : "Confirm"}
          </div>
          <div style={{ padding: "10px 18px", borderRadius: 12, border: `2px solid ${INK}`, color: INK, fontFamily: B, fontWeight: 600, fontSize: 18 }}>Cancel</div>
        </div>
      </div>
      {f >= s + STEP.done && (
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, transform: `scale(${done})`, transformOrigin: "left center" }}>
          <span style={{ width: 30, height: 30, borderRadius: 999, background: "#1faa59", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: B, fontWeight: 600, fontSize: 18, border: `2px solid ${INK}` }}>✓</span>
          <span style={{ fontFamily: B, fontWeight: 600, fontSize: 21, color: INK }}>{c.done}</span>
        </div>
      )}
    </div>
  );
};

/** The phone: header, the current exchange, and the input where the message is typed. */
const Phone: React.FC = () => {
  const f = useCurrentFrame();
  const inn = usePop(T.first - 14);
  const out = inOut(f, T.end - 10, T.end + 8);
  if (f < T.first - 14 || out >= 1) return null;
  const i = Math.max(0, Math.min(COMMANDS.length - 1, Math.floor((f - T.first) / T.step)));
  const s = at(i);
  const c = COMMANDS[i];
  const typed = f < s ? "" : f >= s + STEP.send ? "" : c.say.slice(0, Math.round(c.say.length * inOut(f, s + STEP.type, s + STEP.typeEnd)));
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - 250,
        top: 70,
        width: 500,
        height: 940,
        borderRadius: 60,
        background: "#fdfbf6",
        border: `5px solid ${INK}`,
        boxShadow: `14px 14px 0 ${INK}`,
        overflow: "hidden",
        transform: `translateY(${(1 - inn) * 700 + out * 800}px) rotate(${(1 - inn) * 6}deg)`,
      }}
    >
      <div style={{ height: 130, borderBottom: `3px solid ${INK}`, display: "flex", alignItems: "flex-end", padding: "0 26px 18px", gap: 14, background: "#fff" }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, border: `3px solid ${INK}`, background: "#8fe3b0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: D, fontWeight: 800, fontSize: 26 }}>K</div>
        <div>
          <p style={{ margin: 0, fontFamily: D, fontWeight: 800, fontSize: 28, color: INK }}>Kelpie</p>
          <p style={{ margin: 0, fontFamily: B, fontWeight: 500, fontSize: 16, color: "#1faa59" }}>● your Fuci agent · online</p>
        </div>
      </div>
      <div style={{ position: "absolute", top: 130, left: 0, right: 0, bottom: 110 }}>
        {COMMANDS.map((_, k) => (
          <Exchange key={k} i={k} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 22, height: 72, borderRadius: 999, border: `3px solid ${INK}`, background: "#fff", display: "flex", alignItems: "center", padding: "0 10px 0 24px", gap: 10 }}>
        <span style={{ flex: 1, fontFamily: B, fontWeight: 500, fontSize: 21, color: typed ? INK : "#9a9a9a", whiteSpace: "nowrap", overflow: "hidden" }}>
          {typed || "Message Kelpie…"}
          {typed && <span style={{ opacity: Math.floor(f / 8) % 2 ? 1 : 0.2 }}>|</span>}
        </span>
        <span style={{ width: 52, height: 52, borderRadius: 999, background: typed ? INK : "#d8d8d8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: B, fontWeight: 600, fontSize: 24 }}>↑</span>
      </div>
    </div>
  );
};

/** Around the phone: the command's tag sticker (left) and two constant promises (right). */
const Side: React.FC = () => {
  const f = useCurrentFrame();
  const i = Math.max(0, Math.min(COMMANDS.length - 1, Math.floor((f - T.first) / T.step)));
  const s = at(i);
  const tagPop = usePop(s + STEP.send);
  const tagOut = inOut(f, s + STEP.out, s + STEP.out + 8);
  const p1 = usePop(at(0) + 40);
  const p2 = usePop(at(0) + 52);
  const p3 = usePop(at(1) + 40);
  const out = 1 - inOut(f, T.end - 10, T.end + 6);
  if (f < T.first || out <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Sticker key={i} bg="#fff" pop={tagPop * (1 - tagOut)} rotate={-6} style={{ left: 190, top: 330, fontSize: 110 }}>
        {COMMANDS[i].tag}
      </Sticker>
      <p style={{ position: "absolute", left: 150, top: 540, width: 420, margin: 0, fontFamily: B, fontWeight: 600, fontSize: 26, color: INK, opacity: tagPop * (1 - tagOut) }}>
        “{COMMANDS[i].say}”
      </p>
      <Sticker bg="#fff" pop={p1} rotate={3} style={{ left: 1300, top: 260, fontSize: 44 }}>
        Orders are free
      </Sticker>
      <Sticker bg="#ffe066" pop={p2} rotate={-3} style={{ left: 1320, top: 400, fontSize: 44 }}>
        You confirm each one
      </Sticker>
      <Sticker bg="#ff8fb1" pop={p3} rotate={2} style={{ left: 1290, top: 540, fontSize: 44 }}>
        Plain words. No menus.
      </Sticker>
    </AbsoluteFill>
  );
};

/** End: sticker logo, line and URL. */
const End: React.FC = () => {
  const a = usePop(T.end + 4);
  const b = usePop(T.end + 16);
  const c = usePop(T.end + 28);
  const f = useCurrentFrame();
  if (f < T.end) return null;
  return (
    <AbsoluteFill>
      <Sticker bg="#8fe3b0" pop={a} rotate={-3} style={{ left: 580, top: 250, fontSize: 170 }}>
        fuci
      </Sticker>
      <Sticker bg="#fff" pop={b} rotate={2} style={{ left: 1060, top: 330, fontSize: 70 }}>
        Just ask.
      </Sticker>
      <Sticker bg={INK} pop={c} rotate={-1} style={{ left: 710, top: 620, fontSize: 52, color: "#fff" }}>
        <span style={{ color: "#fff" }}>www.fuci.family</span>
      </Sticker>
      <p style={{ position: "absolute", left: 0, right: 0, top: 800, textAlign: "center", margin: 0, fontFamily: B, fontWeight: 600, fontSize: 28, color: INK, opacity: c }}>
        AI agents on Arc that trade, earn and pay in USDC.
      </p>
    </AbsoluteFill>
  );
};

export const TalkAgent: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <Title />
    <Side />
    <Phone />
    <End />
  </AbsoluteFill>
);
