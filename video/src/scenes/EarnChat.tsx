import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, F, Frond } from "../theme";

/**
 * 18 s: "Your agent earns. Just ask." A product film for Fuci's chat commands and Earn (Circle Earn Kit on
 * Arc): the owner types one line, the agent proposes the exact deposit, the owner confirms and signs, the
 * position earns. Then three more commands, and the end card. Vault names and APYs are live from
 * www.fuci.family/api/earn on 2026-09-28. Timed to public/earnchat.wav (scripts/earnchat.py). No flashing.
 */
export const T = {
  intro: 0,
  chat: 64,
  typeEnd: 112,
  think: 114,
  card: 132,
  click: 184,
  sign: 190,
  signed: 214,
  done: 222,
  earn: 262,
  more: 384,
  end: 468,
  dur: 540,
};
export const MORE_AT = (i: number) => T.more + 8 + i * 22;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const G = C.up;
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const inOut = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });

const PROMPT = "Put all my idle USDC in Earn";
const AMOUNT = 85.12;
const APY = 0.0029;

/** Soft studio background: deep navy into black, a faint green glow and a slow light sweep. */
const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "radial-gradient(1400px 900px at 70% 20%, #0b1a14 0%, #05080a 55%, #000 100%)" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(600px 600px at ${30 + Math.sin(f / 90) * 8}% ${70 + Math.cos(f / 110) * 6}%, rgba(34,197,94,0.10), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage: "radial-gradient(900px 600px at 50% 50%, black, transparent 80%)",
        }}
      />
    </AbsoluteFill>
  );
};

const Glass: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div
    style={{
      background: "linear-gradient(180deg, rgba(22,24,26,0.92), rgba(12,13,14,0.92))",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 24,
      boxShadow: "0 40px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
      ...style,
    }}
  >
    {children}
  </div>
);

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 12, fontFamily: F.mono, fontSize: 22, letterSpacing: 6, color: G }}>
    <span style={{ width: 10, height: 10, borderRadius: "50%", background: G }} />
    {children}
  </div>
);

/* ------------------------------------------------------------------ 1 · title */

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const a = inOut(f, 4, 24);
  const b = inOut(f, 14, 34);
  const out = interpolate(f, [T.chat - 12, T.chat], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 18}px)` }}>
        <Eyebrow>NEW ON FUCI</Eyebrow>
      </div>
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 124, color: C.ink, marginTop: 22, letterSpacing: -2, opacity: a, transform: `translateY(${(1 - a) * 24}px)` }}>
        Your agent earns.
      </div>
      <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 64, color: C.ink2, marginTop: 6, opacity: b, transform: `translateY(${(1 - b) * 18}px)` }}>
        Just ask.
      </div>
      <div style={{ fontFamily: F.body, fontSize: 26, color: C.muted, marginTop: 36, opacity: b }}>Powered by Circle Earn Kit on Arc</div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 2 · chat demo */

const Chat: React.FC = () => {
  const f = useCurrentFrame();
  const inA = inOut(f, T.chat, T.chat + 18);
  const outA = interpolate(f, [T.earn - 14, T.earn], [1, 0], clamp);
  const typed = PROMPT.slice(0, Math.max(0, Math.floor(interpolate(f, [T.chat + 12, T.typeEnd], [0, PROMPT.length], clamp))));
  const sent = f >= T.typeEnd + 2;
  const dots = f >= T.think && f < T.card;
  const card = inOut(f, T.card, T.card + 16);
  const press = interpolate(f, [T.click, T.click + 3, T.click + 8], [1, 0.95, 1], clamp);
  const sheet = interpolate(f, [T.sign, T.sign + 8, T.signed + 2, T.signed + 10], [0, 1, 1, 0], clamp);
  const done = inOut(f, T.done, T.done + 14);
  // Cursor glides to Confirm, clicks, then leaves.
  const cur = inOut(f, T.click - 26, T.click - 2);
  const curOp = interpolate(f, [T.click - 30, T.click - 24, T.click + 10, T.click + 18], [0, 1, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ opacity: inA * outA }}>
      <div style={{ position: "absolute", left: 160, top: 120, width: 560, transform: `translateY(${(1 - inA) * 20}px)` }}>
        <Eyebrow>CHAT</Eyebrow>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 72, color: C.ink, marginTop: 20, lineHeight: 1.05, letterSpacing: -1 }}>One line.</div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 72, color: C.ink2, lineHeight: 1.05, letterSpacing: -1 }}>Exact action.</div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 72, color: G, lineHeight: 1.05, letterSpacing: -1 }}>Your signature.</div>
        <div style={{ fontFamily: F.body, fontSize: 26, color: C.ink2, marginTop: 30, lineHeight: 1.45, width: 520 }}>
          Your agent shows exactly what it will do. Nothing moves until you confirm with your wallet.
        </div>
      </div>

      <Glass style={{ position: "absolute", left: 800, top: 150, width: 960, height: 780, overflow: "hidden", transform: `translateY(${(1 - inA) * 30}px)` }}>
        {/* window bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 28px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#141414", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Frond size={26} draw={false} />
          </div>
          <div>
            <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 24, color: C.ink }}>Fuci</div>
            <div style={{ fontFamily: F.mono, fontSize: 16, color: C.muted }}>your agent · 85.17 USDC</div>
          </div>
          <div style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: 16, color: G, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: G }} /> live on Arc
          </div>
        </div>

        <div style={{ padding: "30px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* owner's message */}
          {sent && (
            <div style={{ alignSelf: "flex-end", maxWidth: 560, background: "#f5f5f5", color: "#0a0a0a", borderRadius: "20px 20px 6px 20px", padding: "16px 22px", fontFamily: F.body, fontSize: 26 }}>
              {PROMPT}
            </div>
          )}
          {dots && (
            <div style={{ display: "flex", gap: 8, padding: "10px 4px" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: C.ink2, opacity: 0.35 + 0.65 * Math.abs(Math.sin((f - T.think) / 5 + i)) }} />
              ))}
            </div>
          )}
          {/* the agent's proposal */}
          {f >= T.card && (
            <div
              style={{
                opacity: card,
                transform: `translateY(${(1 - card) * 16}px)`,
                border: "1px solid rgba(34,197,94,0.45)",
                background: "rgba(34,197,94,0.06)",
                borderRadius: 18,
                padding: "22px 26px",
                maxWidth: 720,
              }}
            >
              <div style={{ fontFamily: F.mono, fontSize: 16, letterSpacing: 4, color: G }}>YOUR AGENT WILL</div>
              <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 30, color: C.ink, marginTop: 8 }}>Put {AMOUNT.toFixed(2)} USDC into Galaxy USDC</div>
              <div style={{ fontFamily: F.body, fontSize: 22, color: C.ink2, marginTop: 6 }}>
                {(APY * 100).toFixed(2)}% APY · Morpho vault on Arc · withdraw any time
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
                <div style={{ transform: `scale(${press})`, background: f >= T.done ? "#1f1f1f" : C.ink, color: f >= T.done ? C.ink2 : "#000", fontFamily: F.display, fontWeight: 700, fontSize: 20, letterSpacing: 3, padding: "14px 26px", borderRadius: 8 }}>
                  {f >= T.done ? "CONFIRMED" : "CONFIRM"}
                </div>
                <div style={{ border: "1px solid rgba(255,255,255,0.14)", color: C.ink2, fontFamily: F.display, fontWeight: 700, fontSize: 20, letterSpacing: 3, padding: "14px 26px", borderRadius: 8, opacity: f >= T.done ? 0.3 : 1 }}>
                  CANCEL
                </div>
              </div>
            </div>
          )}
          {f >= T.done && (
            <div style={{ opacity: done, transform: `translateY(${(1 - done) * 12}px)`, display: "flex", alignItems: "center", gap: 14, fontFamily: F.body, fontSize: 26, color: C.ink }}>
              <span style={{ width: 36, height: 36, borderRadius: "50%", background: G, color: "#04110a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22 }}>✓</span>
              {AMOUNT.toFixed(2)} USDC is in Galaxy USDC and earning.
            </div>
          )}
        </div>

        {/* composer */}
        <div style={{ position: "absolute", left: 28, right: 28, bottom: 28, display: "flex", gap: 14 }}>
          <div style={{ flex: 1, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "18px 22px", fontFamily: F.body, fontSize: 26, color: sent ? C.muted : C.ink, background: "#0b0b0b" }}>
            {sent ? "Tell your agent what to do…" : typed}
            {!sent && f % 30 < 18 && <span style={{ color: G }}>|</span>}
          </div>
          <div style={{ background: G, color: "#04110a", borderRadius: 14, padding: "18px 26px", fontFamily: F.display, fontWeight: 700, fontSize: 22, letterSpacing: 2 }}>SEND</div>
        </div>

        {/* wallet signature sheet */}
        <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.55 * sheet})`, opacity: sheet > 0 ? 1 : 0 }}>
          <div
            style={{
              position: "absolute",
              left: 230,
              right: 230,
              top: 200 + (1 - sheet) * 40,
              opacity: sheet,
              background: "#121212",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 20,
              padding: "26px 28px",
            }}
          >
            <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 24, color: C.ink }}>Signature request</div>
            <div style={{ fontFamily: F.mono, fontSize: 17, color: C.ink2, marginTop: 14, lineHeight: 1.6, background: "#0a0a0a", borderRadius: 12, padding: "14px 16px" }}>
              Fuci: update my agent
              <br />
              Action: earn-deposit
              <br />
              Detail: Galaxy USDC · {AMOUNT.toFixed(2)}
            </div>
            <div style={{ marginTop: 16, background: f >= T.signed ? G : C.ink, color: "#000", textAlign: "center", borderRadius: 10, padding: "12px 0", fontFamily: F.display, fontWeight: 700, fontSize: 20, letterSpacing: 3 }}>
              {f >= T.signed ? "SIGNED ✓" : "SIGN"}
            </div>
          </div>
        </div>
      </Glass>

      <svg
        width="46"
        height="46"
        viewBox="0 0 24 24"
        style={{ position: "absolute", left: interpolate(cur, [0, 1], [1600, 915]), top: interpolate(cur, [0, 1], [980, 512]), opacity: curOp }}
      >
        <path d="M4 2l16 10-7 2 4 8-3 1.5-4-8-6 5z" fill="#fff" stroke="#000" strokeWidth="1.2" />
      </svg>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 3 · the position earns */

const VAULTS = [
  { name: "Galaxy USDC", apy: "0.29%", tvl: "$84.8M" },
  { name: "Keyrock Prime USDC", apy: "0.29%", tvl: "$75.0M" },
  { name: "Galaxy EURC", apy: "0.12%", tvl: "$502K" },
];

const Earn: React.FC = () => {
  const f = useCurrentFrame();
  const a = inOut(f, T.earn, T.earn + 18);
  const out = interpolate(f, [T.more - 14, T.more], [1, 0], clamp);
  // An accelerated clock so the yield visibly ticks (labelled as illustrative).
  const grown = AMOUNT * (1 + APY * interpolate(f, [T.earn, T.more], [0, 30 / 365], clamp));
  const points = ["The vault holds it, not Fuci", "Take it out any time", "Fuci takes 10% of the yield, never the deposit"];
  return (
    <AbsoluteFill style={{ opacity: a * out }}>
      <div style={{ position: "absolute", left: 160, top: 130, transform: `translateY(${(1 - a) * 20}px)` }}>
        <Eyebrow>EARN</Eyebrow>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 80, color: C.ink, marginTop: 18, letterSpacing: -1 }}>Idle USDC, working.</div>
      </div>

      <Glass style={{ position: "absolute", left: 160, top: 330, width: 900, padding: "40px 44px", transform: `translateY(${(1 - a) * 26}px)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 30, color: C.ink }}>Galaxy USDC</div>
          <div style={{ fontFamily: F.mono, fontSize: 22, color: G, border: "1px solid rgba(34,197,94,0.4)", borderRadius: 999, padding: "6px 16px" }}>{(APY * 100).toFixed(2)}% APY</div>
        </div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 104, color: C.ink, marginTop: 20, letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>
          {grown.toFixed(6)} <span style={{ fontSize: 40, color: C.ink2 }}>USDC</span>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 22, color: G, marginTop: 6 }}>+{(grown - AMOUNT).toFixed(6)} earned</div>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 14 }}>
          {points.map((p, i) => {
            const o = inOut(f, T.earn + 26 + i * 10, T.earn + 40 + i * 10);
            return (
              <div key={p} style={{ opacity: o, transform: `translateX(${(1 - o) * -14}px)`, display: "flex", alignItems: "center", gap: 14, fontFamily: F.body, fontSize: 26, color: C.ink2 }}>
                <span style={{ color: G, fontWeight: 700 }}>✓</span>
                {p}
              </div>
            );
          })}
        </div>
      </Glass>

      <div style={{ position: "absolute", left: 1120, top: 330, width: 640 }}>
        <div style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: 5, color: C.muted, opacity: a }}>LIVE VAULTS ON ARC</div>
        {VAULTS.map((v, i) => {
          const o = inOut(f, T.earn + 16 + i * 9, T.earn + 32 + i * 9);
          return (
            <Glass key={v.name} style={{ marginTop: 16, padding: "22px 26px", opacity: o, transform: `translateY(${(1 - o) * 16}px)`, borderRadius: 18, display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 26, color: C.ink }}>{v.name}</div>
                <div style={{ fontFamily: F.mono, fontSize: 18, color: C.muted, marginTop: 4 }}>Morpho · {v.tvl} deposited</div>
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 26, color: G }}>{v.apy}</div>
            </Glass>
          );
        })}
        <div style={{ fontFamily: F.body, fontSize: 18, color: C.muted, marginTop: 18, opacity: a }}>Balance growth sped up for illustration. Rates change and are not guaranteed.</div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 4 · more commands */

const MORE = [
  { say: "DCA $FUCI 2 USDC every hour", did: "Plan saved · autopilot on" },
  { say: "Take my money out of Earn", did: "85.12 USDC back in the wallet" },
  { say: "Stop the autopilot", did: "Autopilot off" },
];

const More: React.FC = () => {
  const f = useCurrentFrame();
  const a = inOut(f, T.more, T.more + 16);
  const out = interpolate(f, [T.end - 12, T.end], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: a * out, alignItems: "center" }}>
      <div style={{ marginTop: 150, textAlign: "center" }}>
        <Eyebrow>ONE CHAT, THE WHOLE AGENT</Eyebrow>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 76, color: C.ink, marginTop: 18, letterSpacing: -1 }}>Earn, DCA, autopilot, trades.</div>
      </div>
      <div style={{ marginTop: 60, display: "flex", flexDirection: "column", gap: 22, width: 1100 }}>
        {MORE.map((m, i) => {
          const o = inOut(f, MORE_AT(i), MORE_AT(i) + 14);
          const ok = inOut(f, MORE_AT(i) + 12, MORE_AT(i) + 24);
          return (
            <div key={m.say} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, opacity: o, transform: `translateY(${(1 - o) * 16}px)` }}>
              <div style={{ background: "#f5f5f5", color: "#0a0a0a", borderRadius: "20px 20px 6px 20px", padding: "18px 26px", fontFamily: F.body, fontSize: 30 }}>{m.say}</div>
              <div style={{ opacity: ok, display: "flex", alignItems: "center", gap: 12, fontFamily: F.mono, fontSize: 24, color: G, border: "1px solid rgba(34,197,94,0.4)", borderRadius: 999, padding: "12px 22px", background: "rgba(34,197,94,0.06)" }}>
                ✓ {m.did}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 5 · end card */

const End: React.FC = () => {
  const f = useCurrentFrame();
  const a = inOut(f, T.end, T.end + 20);
  const b = inOut(f, T.end + 14, T.end + 32);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: a }}>
      <Frond size={130} delay={T.end} />
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 96, color: C.ink, marginTop: 24, letterSpacing: -1 }}>Just tell your agent.</div>
      <div style={{ fontFamily: F.mono, fontSize: 34, color: G, marginTop: 20, opacity: b }}>fuci.family/earn</div>
      <div style={{ fontFamily: F.body, fontSize: 24, color: C.muted, marginTop: 26, opacity: b }}>Built with Circle Earn Kit · live on Arc mainnet</div>
    </AbsoluteFill>
  );
};

export const EarnChat: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Backdrop />
      {f < T.chat + 2 && <Intro />}
      {f >= T.chat && f < T.earn + 2 && <Chat />}
      {f >= T.earn - 2 && f < T.more + 2 && <Earn />}
      {f >= T.more - 2 && f < T.end + 2 && <More />}
      {f >= T.end - 2 && <End />}
    </AbsoluteFill>
  );
};
