import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, Caption, Pill, Split, Typed, Window, typedEnd, useIn, useVertical } from "../theme";

const Q = "What's moving on Arc right now?";

type Step = { icon: string; text: string; right?: string; color?: string };
const STEPS: Step[] = [
  { icon: "→", text: "GET /api/x402/argus/launches" },
  { icon: "402", text: "Payment Required", right: "0.001 USDC", color: "#f5c542" },
  { icon: "✎", text: "Signed by the agent's own wallet", right: "EIP-712" },
  { icon: "✓", text: "Paid via Circle Gateway", right: "0.001 USDC", color: C.up },
  { icon: "✓", text: "Bonding Watcher · paid", right: "0.002 USDC", color: C.up },
  { icon: "✓", text: "Tide Oracle · paid", right: "0.0005 USDC", color: C.up },
];

const Row: React.FC<{ step: Step; at: number }> = ({ step, at }) => {
  const s = useIn(at);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "11px 0", opacity: s, transform: `translateY(${(1 - s) * 14}px)` }}>
      <span
        style={{
          minWidth: 64,
          textAlign: "center",
          padding: "5px 0",
          borderRadius: 8,
          background: "#1b1b1b",
          fontFamily: F.mono,
          fontSize: 18,
          color: step.color ?? C.ink2,
        }}
      >
        {step.icon}
      </span>
      <span style={{ flex: 1, fontFamily: F.mono, fontSize: 21, color: C.ink }}>{step.text}</span>
      {step.right && <span style={{ fontFamily: F.mono, fontSize: 20, color: step.color ?? C.muted }}>{step.right}</span>}
    </div>
  );
};

/** 02 · Ask: the agent buys the data it needs over x402, then answers. */
export const Ask: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const win = useIn(8);
  const qStart = 24;
  const asked = typedEnd(Q, qStart, fps, 26) + 8;
  const answer = useIn(asked + STEPS.length * 14 + 6);
  return (
    <Split caption={<Caption n="02 · Ask" title="It pays its own way." sub="Ask anything about Arc. Your agent buys the on-chain data it needs, cents at a time, over x402." />}>
      <div style={{ opacity: win, transform: `translateY(${(1 - win) * 60}px)` }}>
        <Window url="fuci.family/agent/alice" width={vertical ? 920 : 900}>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ flex: 1, padding: "18px 22px", borderRadius: 12, border: `1.5px solid ${C.line}`, background: "#0a0a0a", fontFamily: F.body, fontSize: 27, color: C.ink }}>
              <Typed text={Q} start={qStart} cps={26} caret={frame < asked} />
            </div>
            <div style={{ padding: "18px 26px", borderRadius: 999, background: C.ink, color: C.bg, fontFamily: F.body, fontWeight: 600, fontSize: 25, alignSelf: "center" }}>
              Ask · $0.04
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            {STEPS.map((s, i) => (
              <Row key={s.text} step={s} at={asked + i * 14} />
            ))}
          </div>
          <div
            style={{
              marginTop: 18,
              padding: "20px 24px",
              borderRadius: 14,
              background: C.surface2,
              border: `1.5px solid ${C.line}`,
              fontFamily: F.body,
              fontSize: 25,
              lineHeight: 1.45,
              color: C.ink,
              opacity: answer,
              transform: `translateY(${(1 - answer) * 16}px)`,
            }}
          >
            <span style={{ color: C.muted, fontFamily: F.mono, fontSize: 18, letterSpacing: 3 }}>BRIEF</span>
            <br />
            The newest launches, their taxes, which ones are close to bonding, and the market mood. All from live on-chain data.
          </div>
        </Window>
        <div style={{ marginTop: 26, display: "flex", gap: 14, justifyContent: "center", opacity: answer }}>
          <Pill>No API keys</Pill>
          <Pill>No subscriptions</Pill>
          <Pill>Paid in USDC</Pill>
        </div>
      </div>
    </Split>
  );
};
