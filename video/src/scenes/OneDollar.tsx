import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, Bubbles, Eyebrow, Frond, Pill, Rings, Window, useVertical } from "../theme";

export const FACTORY = "0x77Fa3Ae9604539Fee8F199adC02f12f318c2bFbc";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** Visible between [a, b] frames, with 10-frame fades. */
const phase = (f: number, a: number, b: number) => interpolate(f, [a, a + 10, b - 10, b], [0, 1, 1, 0], clamp);

const Coin: React.FC<{ size: number; flip: number }> = ({ size, flip }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: "radial-gradient(circle at 35% 30%, #5ea0ff, #2775ca 60%, #174a8a)",
      boxShadow: "0 0 60px rgba(39,117,202,0.55), inset 0 -8px 20px rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transform: `rotateY(${(1 - flip) * 540}deg) scale(${flip})`,
      fontFamily: F.display,
      fontWeight: 700,
      fontSize: size * 0.55,
      color: "#fff",
    }}
  >
    $
  </div>
);

const Check: React.FC<{ at: number; label: string; value: string }> = ({ at, label, value }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 14 } });
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, padding: "16px 0", borderTop: `1.5px solid ${C.line}`, opacity: s, transform: `translateX(${(1 - s) * 30}px)` }}>
      <span style={{ fontFamily: F.body, fontSize: 27, color: C.ink }}>
        <span style={{ color: C.up, marginRight: 14 }}>✓</span>
        {label}
      </span>
      <span style={{ fontFamily: F.mono, fontSize: 21, color: C.ink2 }}>{value}</span>
    </div>
  );
};

/** 10 s: 1 USDC puts a Fuci agent on-chain with an ERC-8004 identity, through a verified factory. */
export const OneDollar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();

  // 0–5.5 s: the big "$1", then it shrinks to the top while the agent goes on-chain.
  const pop = spring({ frame: frame - 4, fps, config: { damping: 10, stiffness: 130 } });
  const coin = spring({ frame: frame - 14, fps, config: { damping: 14 } });
  const shrink = interpolate(frame, [60, 78], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 });
  const headA = phase(frame, 0, 168);
  const tagline = interpolate(frame, [26, 38, 58, 66], [0, 1, 1, 0], clamp);

  // Button press, then the three checks.
  const card = phase(frame, 66, 168);
  const click = 92;
  const press = interpolate(frame, [click, click + 3, click + 8], [1, 0.93, 1], clamp);
  const done = frame > click + 6;

  const contract = phase(frame, 164, 244);
  const stamp = spring({ frame: frame - 186, fps, config: { damping: 9, stiffness: 160 } });
  const addr = spring({ frame: frame - 174, fps, config: { damping: 200 } });

  const end = phase(frame, 240, 320);
  const endLine = spring({ frame: frame - 244, fps, config: { damping: 13 } });
  const pills = spring({ frame: frame - 262, fps, config: { damping: 200 } });

  const W = vertical ? 940 : 1000;
  const big = vertical ? 420 : 380;

  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center", justifyContent: "center", perspective: 1200 }}>
      <Rings x="50%" y="42%" opacity={0.9} />
      <Bubbles count={14} />

      {/* $1 + coin: centered, then docked at the top. */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: headA,
          transform: `translateY(${shrink * (vertical ? -640 : -370)}px) scale(${1 - shrink * 0.62})`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: big * 0.12 }}>
          <span
            style={{
              fontFamily: F.display,
              fontWeight: 700,
              fontSize: big,
              lineHeight: 1,
              letterSpacing: -12,
              color: C.ink,
              transform: `scale(${0.5 + 0.5 * pop})`,
              opacity: Math.min(1, pop * 1.5),
              textShadow: "0 0 80px rgba(255,255,255,0.3)",
            }}
          >
            $1
          </span>
          <Coin size={big * 0.62} flip={coin} />
        </div>
        <div style={{ marginTop: 26, fontFamily: F.display, fontWeight: 600, fontSize: vertical ? 64 : 58, color: C.ink2, opacity: tagline }}>is all it takes.</div>
      </AbsoluteFill>

      {/* The agent going on-chain. */}
      <div style={{ position: "absolute", top: vertical ? 680 : 300, opacity: card, transform: `translateY(${(1 - card) * 40}px)` }}>
        <Window url="fuci.family/agent/alice" width={W}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 18 }}>
            <div style={{ width: 70, height: 70, borderRadius: 35, background: "radial-gradient(circle at 35% 30%, #ffffff, #5a5a5a 60%, #1a1a1a)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 42, color: C.ink }}>Alice</div>
              <div style={{ fontFamily: F.mono, fontSize: 18, color: C.muted, letterSpacing: 2 }}>{done ? "ON-CHAIN · ARC MAINNET" : "OFF-CHAIN · NOT YET REGISTERED"}</div>
            </div>
            <div
              style={{
                padding: "16px 26px",
                borderRadius: 999,
                background: done ? C.up : C.ink,
                color: C.bg,
                fontFamily: F.body,
                fontWeight: 600,
                fontSize: 24,
                transform: `scale(${press})`,
                boxShadow: done ? "0 0 36px rgba(34,197,94,0.45)" : undefined,
              }}
            >
              {done ? "✓ Created" : "Create on-chain · 1 USDC"}
            </div>
          </div>
          <Check at={click + 12} label="Agent identity minted" value="ERC-8004 NFT" />
          <Check at={click + 24} label="Its own USDC wallet" value="pays over x402" />
          <Check at={click + 36} label="Findable by every agent on Arc" value="A2A · MCP" />
        </Window>
      </div>

      {/* The verified factory. */}
      <div style={{ position: "absolute", opacity: contract, transform: `translateY(${(1 - contract) * 40}px)`, width: W, top: vertical ? 720 : 300 }}>
        <Eyebrow>Arc explorer · contract</Eyebrow>
        <div style={{ marginTop: 20, padding: 34, borderRadius: 22, background: "#0d1526", border: "1.5px solid #1f2b44" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: vertical ? 52 : 56, color: C.ink }}>FuciAgentFactory</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 18px",
                borderRadius: 999,
                background: "rgba(34,197,94,0.15)",
                border: `1.5px solid ${C.up}`,
                color: C.up,
                fontFamily: F.body,
                fontWeight: 600,
                fontSize: 26,
                transform: `scale(${stamp})`,
                opacity: Math.min(1, stamp * 1.5),
              }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 14, background: C.up, color: C.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>✓</span>
              Verified
            </span>
          </div>
          <div style={{ marginTop: 22, fontFamily: F.mono, fontSize: vertical ? 30 : 30, color: C.ink2, opacity: addr, wordBreak: "break-all" }}>{FACTORY}</div>
          <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "auto 1fr", gap: "12px 28px", fontFamily: F.body, fontSize: 26, opacity: addr }}>
            <span style={{ color: C.muted }}>Fee</span>
            <span style={{ color: C.ink }}>1 USDC per agent</span>
            <span style={{ color: C.muted }}>Goes to</span>
            <span style={{ color: C.ink }}>Fuci treasury (Safe multisig)</span>
            <span style={{ color: C.muted }}>Mints</span>
            <span style={{ color: C.ink }}>ERC-8004 agent identity</span>
          </div>
        </div>
      </div>

      {/* Close. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: end, padding: "0 60px" }}>
        <Frond size={vertical ? 150 : 120} delay={240} />
        <div
          style={{
            marginTop: 24,
            fontFamily: F.display,
            fontWeight: 700,
            fontSize: vertical ? 110 : 110,
            lineHeight: 1.05,
            letterSpacing: -3,
            color: C.ink,
            textAlign: "center",
            opacity: endLine,
            transform: `translateY(${(1 - endLine) * 30}px)`,
          }}
        >
          <span style={{ whiteSpace: "nowrap" }}>Your agent.</span>
          {vertical ? <br /> : " "}
          <span style={{ whiteSpace: "nowrap" }}>On-chain.</span>
          <br />
          For <span style={{ color: C.up }}>$1</span>.
        </div>
        <div style={{ marginTop: 40, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", opacity: pills }}>
          <Pill style={{ color: C.ink, fontSize: 26 }}>fuci.family</Pill>
          <Pill>Arc mainnet</Pill>
          <Pill>ERC-8004</Pill>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
