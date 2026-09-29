import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, F, Frond } from "../theme";

/**
 * 18 s: "Fuci, built on Arc." Arc calls itself an economic operating system where agents can transact,
 * contract and coordinate. This film takes those three words as chapters and shows what Fuci's agents
 * already do for each. The look is a blueprint: a blue-black grid, thin schematic lines and packets moving
 * along them. Numbers are live from www.fuci.family/api/stats/public on 2026-09-29. Timed to public/arcos.wav
 * (scripts/arcos.py). No flashing: everything fades or slides.
 */
export const T = { intro: 0, transact: 96, contract: 216, coordinate: 336, end: 450, dur: 540 };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const inOut = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });
const BLUE = "#5b8cff";
const G = C.up;
const LINE = "rgba(140,170,255,0.22)";

/** Blueprint backdrop: a blue-black field, a fine grid and a slow scan line. */
const Blueprint: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "radial-gradient(1600px 1000px at 50% 40%, #0a1230 0%, #050816 55%, #02030a 100%)" }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(120,150,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(120,150,255,0.07) 1px, transparent 1px), linear-gradient(rgba(120,150,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(120,150,255,0.03) 1px, transparent 1px)",
          backgroundSize: "120px 120px, 120px 120px, 24px 24px, 24px 24px",
          backgroundPosition: `0 ${(f * 0.4) % 120}px, 0 0, 0 ${(f * 0.4) % 24}px, 0 0`,
          maskImage: "radial-gradient(1100px 700px at 50% 50%, black, transparent 85%)",
        }}
      />
      <AbsoluteFill style={{ top: ((f * 3) % 1300) - 120, height: 120, background: "linear-gradient(rgba(91,140,255,0), rgba(91,140,255,0.05), rgba(91,140,255,0))" }} />
    </AbsoluteFill>
  );
};

/** The OS rail on the left: the three verbs, the active one lit. */
const Rail: React.FC = () => {
  const f = useCurrentFrame();
  const items: [string, number, number][] = [
    ["transact", T.transact, T.contract],
    ["contract", T.contract, T.coordinate],
    ["coordinate", T.coordinate, T.end],
  ];
  const show = inOut(f, T.transact - 20, T.transact) * (1 - inOut(f, T.end - 10, T.end + 8));
  return (
    <div style={{ position: "absolute", left: 96, top: 250, opacity: show, transform: `translateX(${(1 - show) * -30}px)` }}>
      <p style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: 4, color: BLUE, margin: 0 }}>ARC · ECONOMIC OS</p>
      <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 26 }}>
        {items.map(([name, a, b], i) => {
          const on = inOut(f, a, a + 14) * (1 - inOut(f, b - 6, b + 8));
          const done = f >= b;
          return (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <span style={{ fontFamily: F.mono, fontSize: 18, color: C.muted, width: 34 }}>0{i + 1}</span>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  border: `2px solid ${on > 0.5 || done ? G : "rgba(255,255,255,0.25)"}`,
                  background: done ? G : on > 0.5 ? "rgba(34,197,94,0.25)" : "transparent",
                }}
              />
              <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 40 + on * 10, color: on > 0.3 ? C.ink : done ? C.ink2 : "rgba(255,255,255,0.35)" }}>{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** A schematic node: a rounded box with a mono label. */
const Node: React.FC<{ x: number; y: number; w?: number; label: string; sub?: string; accent?: string; show: number; big?: boolean }> = ({ x, y, w = 250, label, sub, accent = BLUE, show, big }) => (
  <div
    style={{
      position: "absolute",
      left: x - w / 2,
      top: y - (big ? 60 : 44),
      width: w,
      height: big ? 120 : 88,
      borderRadius: 16,
      border: `1.5px solid ${accent}`,
      background: "rgba(8,14,36,0.85)",
      boxShadow: `0 0 40px ${accent}22`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      opacity: show,
      transform: `scale(${0.9 + show * 0.1})`,
    }}
  >
    <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: big ? 34 : 24, color: C.ink }}>{label}</span>
    {sub && <span style={{ marginTop: 6, fontFamily: F.mono, fontSize: 17, color: accent }}>{sub}</span>}
  </div>
);

/** Chapter title on the right side: the verb and one plain line. */
const Title: React.FC<{ at: number; verb: string; line: string }> = ({ at, verb, line }) => {
  const f = useCurrentFrame();
  const s = inOut(f, at, at + 18) * (1 - inOut(f, at + 108, at + 122));
  return (
    <div style={{ position: "absolute", left: 560, top: 150, opacity: s, transform: `translateY(${(1 - s) * 20}px)` }}>
      <p style={{ margin: 0, fontFamily: F.display, fontWeight: 700, fontSize: 84, letterSpacing: -2, color: C.ink }}>
        Agents {verb}<span style={{ color: G }}>.</span>
      </p>
      <p style={{ margin: "10px 0 0", fontFamily: F.body, fontSize: 30, color: C.ink2 }}>{line}</p>
    </div>
  );
};

/** A packet travelling along a straight line from (x1,y1) to (x2,y2), looping. */
const Packet: React.FC<{ x1: number; y1: number; x2: number; y2: number; start: number; every: number; text: string; show: number; color?: string }> = ({ x1, y1, x2, y2, start, every, text, show, color = G }) => {
  const f = useCurrentFrame();
  if (f < start) return null;
  const p = ((f - start) % every) / every;
  const t = Easing.inOut(Easing.cubic)(Math.min(1, p * 1.25));
  const fade = interpolate(p, [0, 0.08, 0.56, 0.68], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: x1 + (x2 - x1) * t,
        top: y1 + (y2 - y1) * t,
        transform: "translate(-50%,-50%)",
        opacity: fade * show,
        padding: "5px 12px",
        borderRadius: 999,
        background: color,
        color: "#03120a",
        fontFamily: F.mono,
        fontWeight: 500,
        fontSize: 16,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};

const Wire: React.FC<{ x1: number; y1: number; x2: number; y2: number; show: number; dash?: boolean }> = ({ x1, y1, x2, y2, show, dash }) => {
  const len = Math.hypot(x2 - x1, y2 - y1);
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width={1920} height={1080}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LINE} strokeWidth={2} strokeDasharray={dash ? "8 8" : `${len}`} strokeDashoffset={dash ? 0 : len * (1 - show)} />
    </svg>
  );
};

const Counter: React.FC<{ at: number; to: number; label: string; x: number; y: number; show: number; decimals?: number }> = ({ at, to, label, x, y, show, decimals = 0 }) => {
  const f = useCurrentFrame();
  const v = to * inOut(f, at, at + 50);
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: show }}>
      <p style={{ margin: 0, fontFamily: F.display, fontWeight: 700, fontSize: 64, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{v.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}</p>
      <p style={{ margin: "2px 0 0", fontFamily: F.mono, fontSize: 18, color: C.muted, letterSpacing: 1 }}>{label}</p>
    </div>
  );
};

/** 1. Transact: a Fuci agent pays per call for live data, in USDC over x402. */
const Transact: React.FC = () => {
  const f = useCurrentFrame();
  const a = T.transact;
  const vis = inOut(f, a + 10, a + 30) * (1 - inOut(f, a + 108, a + 122));
  if (vis <= 0) return null;
  const hub = { x: 820, y: 640 };
  const apis: [string, string][] = [
    ["Launch Scout", "$0.001"],
    ["Risk Rating", "$0.002"],
    ["Know Your Agent", "$0.002"],
    ["Tide Oracle", "$0.0005"],
  ];
  return (
    <AbsoluteFill style={{ opacity: vis }}>
      {apis.map(([name], i) => {
        const y = 400 + i * 150;
        const s = inOut(f, a + 20 + i * 6, a + 40 + i * 6);
        return <Wire key={name} x1={hub.x + 150} y1={hub.y} x2={1330} y2={y} show={s} />;
      })}
      <Node x={hub.x} y={hub.y} w={300} label="Fuci agent" sub="wallet · USDC" accent={G} show={inOut(f, a + 12, a + 30)} big />
      {apis.map(([name, price], i) => {
        const y = 400 + i * 150;
        return <Node key={name} x={1470} y={y} w={280} label={name} sub={`${price} / call`} show={inOut(f, a + 24 + i * 6, a + 44 + i * 6)} />;
      })}
      {apis.map(([name, price], i) => (
        <Packet key={name} x1={hub.x + 150} y1={hub.y} x2={1330} y2={400 + i * 150} start={a + 44 + i * 9} every={42} text={`${price} USDC`} show={1} />
      ))}
      <Counter at={a + 40} to={1073} label="x402 PAYMENTS SETTLED" x={560} y={860} show={inOut(f, a + 36, a + 50)} />
      <div style={{ position: "absolute", left: 1000, top: 872, opacity: inOut(f, a + 50, a + 64), fontFamily: F.mono, fontSize: 20, color: C.ink2, lineHeight: 1.6 }}>
        per call, no subscriptions
        <br />
        <span style={{ color: BLUE }}>Circle Gateway · x402 · USDC</span>
      </div>
    </AbsoluteFill>
  );
};

/** 2. Contract: on-chain identity (ERC-8004), trades on Uniswap v4, idle USDC in Earn vaults. */
const Contract: React.FC = () => {
  const f = useCurrentFrame();
  const a = T.contract;
  const vis = inOut(f, a + 10, a + 30) * (1 - inOut(f, a + 108, a + 122));
  if (vis <= 0) return null;
  const blocks: [string, string, string][] = [
    ["ERC-8004 identity", "agent #196 · reputation 100/100", BLUE],
    ["Uniswap v4 trade", "autopilot · take profit · stop loss", G],
    ["Earn vault deposit", "idle USDC → Morpho vault", "#f5c542"],
  ];
  return (
    <AbsoluteFill style={{ opacity: vis }}>
      {blocks.map(([title, sub, color], i) => {
        const s = inOut(f, a + 22 + i * 16, a + 44 + i * 16);
        const settled = inOut(f, a + 44 + i * 16, a + 56 + i * 16);
        return (
          <div
            key={title}
            style={{
              position: "absolute",
              left: 560,
              top: 380 + i * 150,
              width: 900,
              height: 118,
              borderRadius: 18,
              border: `1.5px solid ${color}`,
              background: "rgba(8,14,36,0.85)",
              display: "flex",
              alignItems: "center",
              padding: "0 32px",
              gap: 28,
              opacity: s,
              transform: `translateX(${(1 - s) * 80}px)`,
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 18, color: C.muted, width: 110 }}>block {23226013 + i * 41}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontFamily: F.display, fontWeight: 600, fontSize: 34, color: C.ink }}>{title}</p>
              <p style={{ margin: "4px 0 0", fontFamily: F.mono, fontSize: 19, color }}>{sub}</p>
            </div>
            <span
              style={{
                fontFamily: F.mono,
                fontSize: 18,
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid ${G}`,
                color: G,
                opacity: settled,
                transform: `scale(${0.85 + settled * 0.15})`,
              }}
            >
              ✓ settled on Arc
            </span>
          </div>
        );
      })}
      <Counter at={a + 60} to={111} label="AUTOPILOT TRADES" x={1560} y={420} show={inOut(f, a + 56, a + 70)} />
      <Counter at={a + 70} to={12} label="AGENTS WITH ON-CHAIN IDS" x={1560} y={600} show={inOut(f, a + 66, a + 80)} />
    </AbsoluteFill>
  );
};

/** 3. Coordinate: agents find each other, check each other and pay each other (A2A, MCP, x402). */
const Coordinate: React.FC = () => {
  const f = useCurrentFrame();
  const a = T.coordinate;
  const vis = inOut(f, a + 10, a + 30) * (1 - inOut(f, T.end - 4, T.end + 10));
  if (vis <= 0) return null;
  const cx = 1150;
  const cy = 620;
  const names = ["Fuci", "Scout", "Oracle", "Trader", "Kelp", "Tide", "Frond", "Holdfast"];
  const pts = names.map((n, i) => {
    const ang = (i / names.length) * Math.PI * 2 - Math.PI / 2 + f / 600;
    return { n, x: cx + Math.cos(ang) * 400, y: cy + Math.sin(ang) * 215 };
  });
  const edges: [number, number, string][] = [
    [0, 3, "A2A"],
    [1, 5, "MCP"],
    [2, 6, "x402"],
    [4, 0, "KYA"],
    [7, 2, "A2A"],
    [3, 5, "x402"],
  ];
  return (
    <AbsoluteFill style={{ opacity: vis }}>
      {edges.map(([i, j], k) => (
        <Wire key={k} x1={pts[i].x} y1={pts[i].y} x2={pts[j].x} y2={pts[j].y} show={inOut(f, a + 30 + k * 5, a + 50 + k * 5)} />
      ))}
      {pts.map((p, i) => {
        const s = inOut(f, a + 16 + i * 3, a + 34 + i * 3);
        return (
          <div key={p.n} style={{ position: "absolute", left: p.x - 70, top: p.y - 28, width: 140, height: 56, borderRadius: 999, border: `1.5px solid ${i === 0 ? G : BLUE}`, background: "rgba(8,14,36,0.9)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: s }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: i === 0 ? G : BLUE }} />
            <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 22, color: C.ink }}>{p.n}</span>
          </div>
        );
      })}
      {edges.map(([i, j, label], k) => (
        <Packet key={k} x1={pts[i].x} y1={pts[i].y} x2={pts[j].x} y2={pts[j].y} start={a + 50 + k * 7} every={48} text={label} show={1} color={label === "x402" ? G : "#9db8ff"} />
      ))}
      <div style={{ position: "absolute", left: 560, top: 880, opacity: inOut(f, a + 50, a + 66), fontFamily: F.mono, fontSize: 21, color: C.ink2, lineHeight: 1.6 }}>
        find · check (Know Your Agent) · hire · pay
        <br />
        <span style={{ color: BLUE }}>A2A · MCP · x402 · ERC-8004 reputation</span>
      </div>
    </AbsoluteFill>
  );
};

/** Opening: Arc's own sentence, then Fuci's answer. */
const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const out = 1 - inOut(f, T.transact - 16, T.transact);
  if (out <= 0) return null;
  const l1 = inOut(f, 6, 26);
  const l2 = inOut(f, 40, 60);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out, textAlign: "center" }}>
      <p style={{ margin: 0, fontFamily: F.mono, fontSize: 24, letterSpacing: 6, color: BLUE, opacity: l1 }}>ARC</p>
      <p style={{ margin: "22px 0 0", fontFamily: F.display, fontWeight: 600, fontSize: 64, color: C.ink2, opacity: l1, transform: `translateY(${(1 - l1) * 16}px)`, maxWidth: 1400, lineHeight: 1.15 }}>
        “An economic OS where agents can <span style={{ color: C.ink }}>transact, contract and coordinate.</span>”
      </p>
      <div style={{ marginTop: 56, display: "flex", alignItems: "center", gap: 22, opacity: l2, transform: `translateY(${(1 - l2) * 16}px)` }}>
        <Frond size={64} delay={40} />
        <p style={{ margin: 0, fontFamily: F.display, fontWeight: 700, fontSize: 78, color: C.ink }}>
          Fuci runs those agents<span style={{ color: G }}>.</span>
        </p>
      </div>
    </AbsoluteFill>
  );
};

/** End card: Fuci, built on Arc. */
const End: React.FC = () => {
  const f = useCurrentFrame();
  const s = inOut(f, T.end, T.end + 22);
  const s2 = inOut(f, T.end + 20, T.end + 40);
  const s3 = inOut(f, T.end + 34, T.end + 54);
  if (s <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", opacity: s }}>
      <div style={{ display: "flex", alignItems: "center", gap: 26, transform: `translateY(${(1 - s) * 20}px)` }}>
        <Frond size={96} delay={T.end} />
        <p style={{ margin: 0, fontFamily: F.display, fontWeight: 700, fontSize: 140, letterSpacing: -4, color: C.ink }}>Fuci</p>
      </div>
      <p style={{ margin: "18px 0 0", fontFamily: F.display, fontWeight: 600, fontSize: 52, color: C.ink2, opacity: s2 }}>
        built on <span style={{ color: BLUE }}>Arc</span>
      </p>
      <p style={{ margin: "40px 0 0", fontFamily: F.body, fontSize: 28, color: C.muted, opacity: s3 }}>AI agents that pay, trade and earn in USDC.</p>
      <p style={{ margin: "26px 0 0", fontFamily: F.mono, fontSize: 30, color: G, opacity: s3 }}>www.fuci.family</p>
    </AbsoluteFill>
  );
};

export const ArcOS: React.FC = () => (
  <AbsoluteFill style={{ background: "#02030a" }}>
    <Blueprint />
    <Intro />
    <Rail />
    <Title at={T.transact} verb="transact" line="Each Fuci agent pays for live data per call, in USDC." />
    <Transact />
    <Title at={T.contract} verb="contract" line="Identity, trades and yield: all on-chain, all on Arc." />
    <Contract />
    <Title at={T.coordinate} verb="coordinate" line="They find, check and pay each other." />
    <Coordinate />
    <End />
  </AbsoluteFill>
);
