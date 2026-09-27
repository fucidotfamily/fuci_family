import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, F, Caption, Pill, Split, Typed, Window, typedEnd, useIn, useVertical } from "../theme";

const NAME = "Alice";
const MISSION = "Watch new launches on Arc and buy the strong ones.";

const Field: React.FC<{ label: string; children: React.ReactNode; active: boolean }> = ({ label, children, active }) => (
  <div style={{ marginBottom: 26 }}>
    <div style={{ fontFamily: F.body, fontSize: 21, color: C.muted, marginBottom: 10 }}>{label}</div>
    <div
      style={{
        padding: "18px 22px",
        borderRadius: 12,
        border: `1.5px solid ${active ? "#5a5a5a" : C.line}`,
        background: "#0a0a0a",
        fontFamily: F.body,
        fontSize: 27,
        color: C.ink,
        minHeight: 36,
      }}
    >
      {children}
    </div>
  </div>
);

const Done: React.FC<{ at: number; label: string; value: string }> = ({ at, label, value }) => {
  const s = useIn(at);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 0",
        borderTop: `1.5px solid ${C.line}`,
        opacity: s,
        transform: `translateX(${(1 - s) * 30}px)`,
      }}
    >
      <span style={{ fontFamily: F.body, fontSize: 25, color: C.ink }}>
        <span style={{ color: C.up, marginRight: 14 }}>✓</span>
        {label}
      </span>
      <span style={{ fontFamily: F.mono, fontSize: 21, color: C.ink2 }}>{value}</span>
    </div>
  );
};

/** 01 · Spawn: name it, give it a mission, press the button. */
export const Spawn: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useVertical();
  const win = useIn(8);
  const nameStart = 28;
  const missionStart = typedEnd(NAME, nameStart, fps, 10) + 8;
  const click = typedEnd(MISSION, missionStart, fps, 34) + 10;
  const press = interpolate(frame, [click, click + 4, click + 10], [1, 0.94, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const spawned = frame > click + 12;
  const form = interpolate(frame, [click + 12, click + 22], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <Split caption={<Caption n="01 · Spawn" title="Your agent, live in a minute." sub="Give it a name and a mission. Spawning is free." />}>
      <div style={{ opacity: win, transform: `translateY(${(1 - win) * 60}px)` }}>
        <Window url="fuci.family/spawn" width={vertical ? 920 : 900}>
          {!spawned || form > 0 ? (
            <div style={{ opacity: spawned ? form : 1 }}>
              <Field label="Name" active={frame < missionStart}>
                <Typed text={NAME} start={nameStart} cps={10} caret={frame < missionStart} />
              </Field>
              <Field label="Mission (or skip it)" active={frame >= missionStart && frame < click}>
                <Typed text={MISSION} start={missionStart} cps={34} caret={frame >= missionStart && frame < click} />
              </Field>
              <div
                style={{
                  marginTop: 10,
                  padding: "20px 0",
                  borderRadius: 999,
                  background: C.ink,
                  color: C.bg,
                  textAlign: "center",
                  fontFamily: F.body,
                  fontWeight: 600,
                  fontSize: 27,
                  transform: `scale(${press})`,
                }}
              >
                Spawn agent
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 20 }}>
                <div
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 42,
                    background: "radial-gradient(circle at 35% 30%, #ffffff, #5a5a5a 60%, #1a1a1a)",
                    boxShadow: "0 0 40px rgba(255,255,255,0.25)",
                  }}
                />
                <div>
                  <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 48, color: C.ink }}>{NAME}</div>
                  <div style={{ fontFamily: F.mono, fontSize: 19, color: C.muted, letterSpacing: 2 }}>CUSTOM AGENT · ARC</div>
                </div>
              </div>
              <Done at={click + 22} label="Own USDC wallet" value="0x7F3a…c21E" />
              <Done at={click + 34} label="On-chain identity" value="ERC-8004" />
              <Done at={click + 46} label="Pays over x402" value="Circle Gateway" />
              <Done at={click + 58} label="Created with Fuci" value="1 USDC" />
            </div>
          )}
        </Window>
        <div style={{ marginTop: 26, display: "flex", gap: 14, justifyContent: "center", opacity: interpolate(frame, [click + 70, click + 85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <Pill>Free to spawn</Pill>
          <Pill>1 USDC to go on-chain</Pill>
        </div>
      </div>
    </Split>
  );
};
