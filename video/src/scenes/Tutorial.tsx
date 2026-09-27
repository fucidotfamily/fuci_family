import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Frond, useVertical } from "../theme";
import BOXES from "../../public/tutorial/boxes.json";

/**
 * 48 s tutorial: how to check a DeFi protocol or an Arc token on fuci.family/risk. Real screenshots of the
 * live page (scripts/capture-risk.mjs), a browser (desktop) or phone (vertical) frame, a cursor and slow
 * camera moves. Paced for reading. Sound: public/tutorial.wav from scripts/tutorial.py.
 */

/** Scene starts, shared with scripts/tutorial.py. */
export const T = { intro: 0, open: 180, search: 360, grade: 570, why: 870, token: 1110, outro: 1320, end: 1440 };
/** Moments inside scenes the sound follows. */
export const CUES = { typeStart: 410, typeEnd: 470, pick: 540, openDetails: 1050 };

type Box = { x: number; y: number; w: number; h: number };
type Shot = "landing" | "suggest" | "morpho" | "morpho-open" | "fuci";
/** Screenshot sizes in CSS pixels (desktop captured at 1x, phone at 2x). */
const SIZE: Record<"desk" | "mob", Record<Shot, [number, number]>> = {
  desk: { landing: [1440, 1715], suggest: [1440, 900], morpho: [1440, 2035], "morpho-open": [1440, 2111], fuci: [1440, 2205] },
  mob: { landing: [390, 3261], suggest: [390, 844], morpho: [390, 3412], "morpho-open": [390, 3508], fuci: [390, 3488] },
};
const VIEW_H = { desk: 900, mob: 844 };

const G = "#22c55e";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.45, 0, 0.2, 1);

const TOPICS = ["Security", "Liquidity", "Decentralization", "Audits", "Token concentration", "Protocol history", "Governance", "Yield sustainability"];

const STEPS: { at: number; n: string; title: string; body: string }[] = [
  { at: T.open, n: "01", title: "Open fuci.family/risk", body: "Free for everyone. No wallet, no sign-up. The biggest DeFi protocols on Arc are already graded." },
  { at: T.search, n: "02", title: "Search a protocol, or paste a token address", body: "Type a name like Morpho and pick it from the list. Any token on Arc works too: paste its 0x… address." },
  { at: T.grade, n: "03", title: "Read the grade", body: "A to F, from lower to very high risk. Confidence shows how much of the data we could check." },
  { at: T.why, n: "04", title: "See why", body: "Every check is explained in one sentence, with its score and a link to the source. Open Details for the numbers." },
  { at: T.token, n: "05", title: "Check any token on Arc", body: "Contract control, launch terms, liquidity, holder concentration and age. Hard rules cap the grade, even for our own token." },
];

/** Camera path per scene: which screenshot, and the page areas (CSS px) to frame over time. */
type Key = { f: number; shot: Shot; box: Box | "top" | "full" };

const b = (dev: "desk" | "mob", k: string): Box => (BOXES as Record<string, Box>)[`${dev}.${k}`];

function keys(dev: "desk" | "mob"): Key[] {
  const pad = (x: Box, p = dev === "desk" ? 40 : 14): Box => ({ x: x.x - p, y: x.y - p, w: x.w + 2 * p, h: x.h + 2 * p });
  const f = (k: string) => pad(b(dev, `f.${k}`));
  return [
    { f: T.open, shot: "landing", box: "top" },
    { f: T.open + 90, shot: "landing", box: "top" },
    { f: T.open + 170, shot: "landing", box: pad(b(dev, "cards"), dev === "desk" ? 60 : 20) },
    { f: T.search, shot: "landing", box: "top" },
    { f: T.search + 60, shot: "landing", box: pad(b(dev, "input"), dev === "desk" ? 160 : 30) },
    { f: CUES.typeEnd + 10, shot: "suggest", box: pad(b(dev, "suggest"), dev === "desk" ? 120 : 30) },
    { f: T.grade - 10, shot: "suggest", box: pad(b(dev, "suggest"), dev === "desk" ? 120 : 30) },
    { f: T.grade + 20, shot: "morpho", box: "top" },
    { f: T.grade + 80, shot: "morpho", box: pad(b(dev, "grade")) },
    { f: T.why - 20, shot: "morpho", box: pad(b(dev, "grade")) },
    { f: T.why + 30, shot: "morpho", box: f("Audits") },
    { f: T.why + 70, shot: "morpho", box: f("Security history") },
    { f: T.why + 110, shot: "morpho", box: f("TVL depth & stability") },
    { f: T.why + 150, shot: "morpho", box: f("Governance & decentralization") },
    { f: CUES.openDetails - 10, shot: "morpho", box: f("Yield sustainability") },
    { f: CUES.openDetails + 5, shot: "morpho-open", box: pad(b(dev, "yieldOpen")) },
    { f: T.token - 10, shot: "morpho-open", box: pad(b(dev, "yieldOpen")) },
    { f: T.token + 20, shot: "fuci", box: "top" },
    { f: T.token + 70, shot: "fuci", box: pad(b(dev, "tgrade")) },
    { f: T.token + 130, shot: "fuci", box: pad(b(dev, "limits")) },
    { f: T.outro - 20, shot: "fuci", box: pad(b(dev, "holders")) },
  ];
}

/** Camera (scroll y, zoom, x offset) that frames `box` in a viewport of vw × vh CSS px. */
function frameBox(box: Key["box"], shot: Shot, dev: "desk" | "mob") {
  const [W, H] = SIZE[dev][shot];
  const vw = W;
  const vh = VIEW_H[dev];
  if (box === "top") return { zoom: 1, x: 0, y: 0 };
  if (box === "full") return { zoom: 1, x: 0, y: 0 };
  const zoom = Math.max(1, Math.min(dev === "desk" ? 1.9 : 1.35, vw / box.w, vh / box.h));
  const w = vw / zoom;
  const h = vh / zoom;
  const x = Math.max(0, Math.min(W - w, box.x + box.w / 2 - w / 2));
  const y = Math.max(0, Math.min(H - h, box.y + box.h / 2 - h / 2));
  return { zoom, x, y };
}

function camera(frame: number, dev: "desk" | "mob") {
  const ks = keys(dev);
  let i = 0;
  while (i < ks.length - 1 && frame >= ks[i + 1].f) i++;
  const a = ks[i];
  const n = ks[Math.min(i + 1, ks.length - 1)];
  const ca = frameBox(a.box, a.shot, dev);
  if (n === a || n.shot !== a.shot) return { shot: a.shot, ...ca };
  const cb = frameBox(n.box, n.shot, dev);
  const t = interpolate(frame, [a.f, n.f], [0, 1], { ...clamp, easing: ease });
  return { shot: a.shot, zoom: ca.zoom + (cb.zoom - ca.zoom) * t, x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t };
}

/** Where the cursor points (CSS px on the current screenshot) over time; null = hidden. */
function cursorAt(frame: number, dev: "desk" | "mob"): { x: number; y: number; click: number } | null {
  const inp = b(dev, "input");
  const sug = b(dev, "suggest");
  const pts: [number, number, number][] = [
    [T.search + 20, inp.x + inp.w * 0.8, inp.y + inp.h * 2.2],
    [T.search + 45, inp.x + inp.w * 0.3, inp.y + inp.h * 0.55],
    [CUES.pick - 25, sug.x + sug.w * 0.35, sug.y + 26],
    [CUES.pick, sug.x + sug.w * 0.35, sug.y + 26],
  ];
  if (frame < T.search + 20 || frame > T.grade) {
    if (frame >= CUES.openDetails - 40 && frame <= CUES.openDetails + 25) {
      const y = b(dev, "f.Yield sustainability");
      return { x: y.x + (dev === "desk" ? 60 : 40), y: y.y + y.h - (dev === "desk" ? 22 : 20), click: interpolate(frame, [CUES.openDetails, CUES.openDetails + 14], [0, 1], clamp) };
    }
    return null;
  }
  let i = 0;
  while (i < pts.length - 1 && frame >= pts[i + 1][0]) i++;
  const a = pts[i];
  const n = pts[Math.min(i + 1, pts.length - 1)];
  const t = n === a ? 1 : interpolate(frame, [a[0], n[0]], [0, 1], { ...clamp, easing: ease });
  const click = Math.max(interpolate(frame, [T.search + 45, T.search + 59], [0, 1], clamp) * (frame < T.search + 70 ? 1 : 0), interpolate(frame, [CUES.pick, CUES.pick + 14], [0, 1], clamp) * (frame < CUES.pick + 20 ? 1 : 0));
  return { x: a[1] + (n[1] - a[1]) * t, y: a[2] + (n[2] - a[2]) * t, click };
}

/** The page inside the frame: a screenshot moved by the camera, plus the cursor and typing overlay. */
const Screen: React.FC<{ w: number; h: number; dev: "desk" | "mob" }> = ({ w, h, dev }) => {
  const frame = useCurrentFrame();
  const cam = camera(frame, dev);
  const [W] = SIZE[dev][cam.shot];
  const s = (w / W) * cam.zoom; // screen px per CSS px
  const to = (x: number, y: number) => ({ left: (x - cam.x) * s, top: (y - cam.y) * s });
  const cur = cursorAt(frame, dev);
  const typed = "morpho".slice(0, Math.floor(interpolate(frame, [CUES.typeStart, CUES.typeEnd], [0, 6], clamp)));
  const inp = b(dev, "input");
  const showTyping = cam.shot === "landing" && frame >= CUES.typeStart - 5;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#000" }}>
      <Img src={staticFile(`tutorial/${dev}-${cam.shot}.png`)} style={{ position: "absolute", width: W * s, left: -cam.x * s, top: -cam.y * s }} />
      {showTyping && (
        <div style={{ position: "absolute", ...to(inp.x + 2, inp.y + 2), width: (inp.w - 4) * s, height: (inp.h - 4) * s, background: "#000", display: "flex", alignItems: "center", paddingLeft: 15 * s, fontFamily: F.mono, fontSize: 14 * s, color: "#fff" }}>
          {typed}
          <span style={{ opacity: Math.floor(frame / 15) % 2 ? 0.2 : 1 }}>▍</span>
        </div>
      )}
      {cur && (
        <div style={{ position: "absolute", ...to(cur.x, cur.y), width: 0, height: 0 }}>
          {cur.click > 0 && cur.click < 1 && (
            <div style={{ position: "absolute", left: -30 * cur.click, top: -30 * cur.click, width: 60 * cur.click, height: 60 * cur.click, borderRadius: "50%", border: `3px solid ${G}`, opacity: 1 - cur.click }} />
          )}
          <svg width={dev === "desk" ? 34 : 40} height={dev === "desk" ? 34 : 40} viewBox="0 0 24 24" style={{ position: "absolute", left: -4, top: -2, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}>
            <path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.6 L12 13.8 L19 13.8 Z" fill="#fff" stroke="#000" strokeWidth={1.4} strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
};

const StepCaption: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const step = [...STEPS].reverse().find((s) => frame >= s.at);
  if (!step || frame >= T.outro) return null;
  const idx = STEPS.indexOf(step);
  const p = interpolate(frame, [step.at, step.at + 20], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
      <div style={{ display: "flex", gap: 8, marginBottom: v ? 22 : 26 }}>
        {STEPS.map((s, i) => (
          <div key={s.n} style={{ height: 6, width: i === idx ? 44 : 18, borderRadius: 3, background: i <= idx ? G : "#2a2a2a" }} />
        ))}
      </div>
      <div style={{ fontFamily: F.mono, fontSize: v ? 28 : 24, letterSpacing: 5, color: G }}>STEP {step.n}</div>
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 62 : 58, lineHeight: 1.06, letterSpacing: -1.5, color: "#fff", marginTop: 12 }}>{step.title}</div>
      <div style={{ fontFamily: F.body, fontSize: v ? 32 : 28, lineHeight: 1.4, color: "#b8c0bb", marginTop: 18 }}>{step.body}</div>
    </div>
  );
};

const Intro: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(frame, [T.open - 20, T.open], [1, 0], clamp);
  const title = spring({ frame: frame - 6, fps, config: { damping: 18 } });
  const last = interpolate(frame, [120, 140], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out, padding: v ? "0 60px" : "0 160px" }}>
      <div style={{ textAlign: "center", opacity: title, transform: `translateY(${(1 - title) * 24}px)` }}>
        <div style={{ fontFamily: F.mono, fontSize: v ? 28 : 26, letterSpacing: 6, color: G }}>TUTORIAL · FUCI RISK</div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 84 : 92, lineHeight: 1.04, letterSpacing: -2.5, color: "#fff", marginTop: 20 }}>
          How to check the risk
          <br />
          before you put money in
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: v ? 56 : 48, maxWidth: v ? 960 : 1300 }}>
        {TOPICS.map((t, i) => {
          const a = interpolate(frame, [40 + i * 9, 56 + i * 9], [0, 1], clamp);
          return (
            <div key={t} style={{ opacity: a, transform: `translateY(${(1 - a) * 12}px)`, border: "1px solid #2f3a33", background: "#0d1410", borderRadius: 999, padding: v ? "12px 24px" : "10px 22px", fontFamily: F.body, fontSize: v ? 30 : 28, color: "#d7e2dc" }}>
              {t}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: v ? 48 : 40, fontFamily: F.body, fontSize: v ? 34 : 32, color: "#fff", opacity: last }}>
        All in one grade. <span style={{ color: G }}>Every number sourced.</span>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ v: boolean }> = ({ v }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < T.outro) return null;
  const a = spring({ frame: frame - T.outro, fps, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `rgba(0,0,0,${0.94 * a})`, padding: "0 60px" }}>
      <div style={{ textAlign: "center", opacity: a, transform: `translateY(${(1 - a) * 20}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 26 : 22 }}>
        <Frond size={v ? 110 : 96} draw={false} />
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 76 : 84, lineHeight: 1.06, letterSpacing: -2, color: "#fff" }}>
          Risk is part of investing.
          <br />
          <span style={{ color: G }}>Make it informed.</span>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: v ? 40 : 38, color: "#fff", letterSpacing: 1 }}>fuci.family/risk</div>
        <div style={{ fontFamily: F.body, fontSize: v ? 28 : 26, color: "#9aa39e" }}>Free for people · agents pay per check over x402 · $FUCI</div>
      </div>
    </AbsoluteFill>
  );
};

export const Tutorial: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const v = useVertical();
  const dev = v ? "mob" : "desk";
  const appear = interpolate(frame, [T.open - 10, T.open + 20], [0, 1], { ...clamp, easing: ease });
  const shown = frame >= T.open - 10;

  // Frame geometry: a browser window (landscape) or a phone (portrait).
  const fw = v ? 620 : 1240;
  const screenH = v ? Math.round((fw - 28) * (VIEW_H.mob / 390)) : Math.round(fw * (VIEW_H.desk / 1440));
  const bar = v ? 0 : 52;
  const fx = v ? (width - fw) / 2 : width - fw - 70;
  const fy = v ? height - screenH - 28 - 110 : (height - screenH - bar) / 2;
  const urlText = "fuci.family/risk".slice(0, Math.floor(interpolate(frame, [T.open + 5, T.open + 35], [0, 16], clamp)));
  const cam = camera(frame, dev);
  const url = cam.shot === "morpho" || cam.shot === "morpho-open" ? "fuci.family/risk?protocol=morpho-blue" : cam.shot === "fuci" ? "fuci.family/risk?token=0xe66d…4420" : urlText;

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 30% 20%, #0c1a12 0%, #050806 55%, #000 100%)" }}>
      <Intro v={v} />
      {shown && (
        <>
          <div style={{ position: "absolute", left: v ? 60 : 80, right: v ? 60 : undefined, top: v ? 90 : 0, bottom: v ? undefined : 0, width: v ? undefined : width - fw - 70 - 80 - 60, display: "flex", flexDirection: "column", justifyContent: v ? "flex-start" : "center", opacity: appear }}>
            <StepCaption v={v} />
          </div>
          <div style={{ position: "absolute", left: fx, top: fy, width: fw, opacity: appear, transform: `translateY(${(1 - appear) * 40}px)` }}>
            {v ? (
              <div style={{ borderRadius: 64, padding: 14, background: "#1a1a1a", boxShadow: "0 30px 90px rgba(0,0,0,0.7), inset 0 0 0 2px #2c2c2c" }}>
                <div style={{ position: "relative", height: screenH, borderRadius: 50, overflow: "hidden" }}>
                  <Screen w={fw - 28} h={screenH} dev="mob" />
                </div>
              </div>
            ) : (
              <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,0.7)", border: "1px solid #2a2a2a" }}>
                <div style={{ height: bar, background: "#141414", display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
                  {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                    <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
                  ))}
                  <div style={{ marginLeft: 18, flex: 1, height: 32, borderRadius: 8, background: "#0a0a0a", border: "1px solid #262626", display: "flex", alignItems: "center", padding: "0 14px", fontFamily: F.mono, fontSize: 17, color: "#cfcfcf" }}>
                    🔒&nbsp;&nbsp;{url}
                  </div>
                </div>
                <div style={{ position: "relative", height: screenH }}>
                  <Screen w={fw} h={screenH} dev="desk" />
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <Outro v={v} />
    </AbsoluteFill>
  );
};
