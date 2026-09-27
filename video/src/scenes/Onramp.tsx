import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { F, Frond, useVertical } from "../theme";

/** One beat = 14 frames (~128 BPM). Timings shared with scripts/onramp.py. */
export const BEAT = 14;
export const T = {
  slam1: 0, // NO CRYPTO?
  slam2: 28, // NO PROBLEM.
  fund: 56, // FUND YOUR AI AGENT WITH
  methods: 70, // + i * 2 * BEAT
  phone: 126,
  tapBuy: 144,
  sheet: 156,
  tapPay: 196,
  paid: 208,
  balance: [214, 244] as const,
  autopilot: 256,
  drop: 280, // NO EXCHANGE. / NO BRIDGE. / NO SEED PHRASE. every 2 beats
  go: 364, // JUST FUND & GO.
  end: 392,
};

const LIME = "#b6ff3b";
const GREEN = "#22c55e";
const INK = "#0a0a0a";
/** Live on Fuci today; each stays on screen for two beats. */
const METHODS = ["DEBIT CARD", "BANK TRANSFER"];
const DROP = ["NO EXCHANGE.", "NO BRIDGE.", "NO SEED PHRASE."];

/** A word that lands on its beat with a quick scale-in (no shake, no flash). */
const Slam: React.FC<{ at: number; out?: number; children: React.ReactNode; size: number; color?: string; bg?: string }> = ({ at, out, children, size, color = "#fff", bg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at || (out !== undefined && frame >= out)) return null;
  const s = spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 220 } });
  return (
    <div
      style={{
        display: "inline-block",
        padding: bg ? "0.05em 0.25em" : 0,
        background: bg,
        fontFamily: F.display,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 0.95,
        letterSpacing: -size * 0.03,
        color,
        transform: `scale(${1.25 - 0.25 * s})`,
        opacity: Math.min(1, s * 2),
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
};

/** Diagonal speed stripes that rush past; faster after the drop. */
const Stripes: React.FC<{ speed: number; color: string; opacity: number }> = ({ speed, color, opacity }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      {Array.from({ length: 14 }, (_, i) => {
        const x = ((i * 173 + frame * speed * (1 + (i % 3) * 0.4)) % (width + 800)) - 400;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: -200,
              width: 6 + (i % 4) * 10,
              height: height + 400,
              background: color,
              opacity: 0.08 + (i % 5) * 0.04,
              transform: "skewX(-24deg)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** The phone: agent page → payment sheet → USDC lands → autopilot on. */
const Phone: React.FC<{ scale: number }> = ({ scale }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inn = spring({ frame: frame - T.phone, fps, config: { damping: 14 } });
  const sheet = spring({ frame: frame - T.sheet, fps, config: { damping: 16 } });
  const sheetOut = spring({ frame: frame - T.paid - 4, fps, config: { damping: 18 } });
  const paid = frame >= T.paid;
  const bal = interpolate(frame, [T.balance[0], T.balance[1]], [0, 50], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - (1 - t) ** 3 });
  const auto = spring({ frame: frame - T.autopilot, fps, config: { damping: 10, stiffness: 200 } });
  const press = (at: number) => (frame >= at && frame < at + 6 ? 0.92 : 1);
  const tapRing = (at: number) => {
    const t = frame - at;
    return t >= 0 && t < 14 ? { r: 10 + t * 4, o: 1 - t / 14 } : null;
  };
  const buyRing = tapRing(T.tapBuy);
  const payRing = tapRing(T.tapPay);

  return (
    <div style={{ transform: `translateY(${(1 - inn) * 500}px) rotate(${(1 - inn) * 8}deg) scale(${scale})`, opacity: inn }}>
      <div style={{ width: 400, height: 820, borderRadius: 56, background: "#111", padding: 14, boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 0 3px #2a2a2a, 0 0 80px ${paid ? "rgba(182,255,59,0.35)" : "rgba(0,0,0,0)"}` }}>
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 44, background: "#050505", overflow: "hidden", fontFamily: F.body, color: "#fff" }}>
          <div style={{ position: "absolute", top: 12, left: "50%", marginLeft: -60, width: 120, height: 30, borderRadius: 16, background: "#000" }} />
          {/* Agent screen */}
          <div style={{ padding: "70px 26px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 54, height: 54, borderRadius: 27, border: "2px solid #333", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Frond size={34} draw={false} />
              </div>
              <div>
                <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 26 }}>your-agent</div>
                <div style={{ fontFamily: F.mono, fontSize: 13, color: "#8a8a8a" }}>AI agent on Arc</div>
              </div>
            </div>
            <div style={{ marginTop: 26, borderRadius: 18, border: `2px solid ${paid ? LIME : "#262626"}`, padding: "18px 20px", background: "#0d0d0d" }}>
              <div style={{ fontSize: 15, color: "#8a8a8a" }}>Agent balance</div>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 56, lineHeight: 1.1, color: paid ? LIME : "#fff", fontVariantNumeric: "tabular-nums" }}>
                {bal.toFixed(2)} <span style={{ fontSize: 22, color: "#8a8a8a" }}>USDC</span>
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 12, color: "#8a8a8a" }}>on Arc · agent wallet</div>
            </div>
            <div style={{ position: "relative", marginTop: 20, borderRadius: 16, background: LIME, color: INK, textAlign: "center", padding: "18px 0", fontWeight: 700, fontSize: 20, transform: `scale(${press(T.tapBuy)})` }}>
              Buy with card / bank
              {buyRing && <div style={{ position: "absolute", left: "50%", top: "50%", width: buyRing.r * 2, height: buyRing.r * 2, marginLeft: -buyRing.r, marginTop: -buyRing.r, borderRadius: "50%", border: "3px solid #fff", opacity: buyRing.o }} />}
            </div>
            <div
              style={{
                marginTop: 20,
                borderRadius: 16,
                border: `2px solid ${frame >= T.autopilot ? GREEN : "#262626"}`,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transform: `scale(${1 + 0.08 * Math.sin(Math.PI * Math.min(1, auto))})`,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 20 }}>Autopilot</span>
              <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: 18, color: frame >= T.autopilot ? GREEN : "#666" }}>{frame >= T.autopilot ? "▶ ON" : "OFF"}</span>
            </div>
          </div>

          {/* Payment sheet */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 470,
              borderRadius: "30px 30px 0 0",
              background: "#f5f5f5",
              color: INK,
              padding: "26px 26px",
              transform: `translateY(${(1 - sheet) * 100 + sheetOut * 110}%)`,
              boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ width: 50, height: 5, borderRadius: 3, background: "#ccc", margin: "0 auto 18px" }} />
            <div style={{ fontFamily: F.mono, fontSize: 13, color: "#666", letterSpacing: 2 }}>BUY USDC · ARC</div>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 64, marginTop: 6 }}>$50.00</div>
            <div style={{ fontSize: 15, color: "#555" }}>≈ 50 USDC to your agent · fees shown before you pay</div>
            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {["Debit card", "Bank transfer"].map((m, i) => (
                <div key={m} style={{ borderRadius: 12, border: `2px solid ${i === 0 ? INK : "#ddd"}`, padding: "12px 0", textAlign: "center", fontWeight: 600, fontSize: 17 }}>
                  {m}
                </div>
              ))}
            </div>
            <div style={{ position: "relative", marginTop: 20, borderRadius: 14, background: paid ? GREEN : INK, color: "#fff", textAlign: "center", padding: "18px 0", fontWeight: 700, fontSize: 22, transform: `scale(${press(T.tapPay)})` }}>
              {paid ? "✓ Paid" : "Pay $50.00"}
              {payRing && <div style={{ position: "absolute", left: "50%", top: "50%", width: payRing.r * 2, height: payRing.r * 2, marginLeft: -payRing.r, marginTop: -payRing.r, borderRadius: "50%", border: "3px solid #fff", opacity: payRing.o }} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 15 s: "Fund your AI agent with a card or bank transfer". Hype kinetic type on a 128 BPM beat, a phone showing the
 * real flow, a drop, then Fuci on Arc. Sound: public/onramp.wav from scripts/onramp.py.
 */
export const Onramp: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useVertical();
  const big = v ? 150 : 190;
  const afterDrop = frame >= T.drop && frame < T.end;
  // Calm, steady background: no flashing (easier on the eyes).
  const bg = INK;
  const fg = "#fff";
  const methodIdx = Math.min(METHODS.length - 1, Math.floor((frame - T.methods) / (BEAT * 2)));
  const end = spring({ frame: frame - T.end, fps, config: { damping: 14 } });
  const phoneOn = frame >= T.phone && frame < T.drop;

  return (
    <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
      <Stripes speed={afterDrop ? 14 : 8} color={LIME} opacity={frame < T.phone || afterDrop ? 1 : 0.5} />
      <AbsoluteFill>
        {/* A. NO CRYPTO? NO PROBLEM. */}
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
          <Slam at={T.slam1} out={T.fund} size={big}>
            NO CRYPTO?
          </Slam>
          <Slam at={T.slam2} out={T.fund} size={big} color={INK} bg={LIME}>
            NO PROBLEM.
          </Slam>
        </AbsoluteFill>

        {/* B. FUND YOUR AI AGENT WITH … */}
        {frame >= T.fund && frame < T.phone && (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, padding: "0 40px" }}>
            <Slam at={T.fund} size={v ? 96 : 110}>
              FUND YOUR AI AGENT WITH
            </Slam>
            {frame >= T.methods && (
              <div key={methodIdx}>
                <Slam at={T.methods + methodIdx * BEAT * 2} size={v ? 120 : 170} color={INK} bg={LIME}>
                  {METHODS[methodIdx]}
                </Slam>
              </div>
            )}
          </AbsoluteFill>
        )}

        {/* C. The phone, with captions */}
        {phoneOn && (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: v ? "column" : "row", gap: v ? 30 : 90 }}>
            {!v && (
              <div style={{ width: 520, textAlign: "right", display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-end" }}>
                <Slam at={T.tapBuy} size={70}>
                  1. TAP BUY
                </Slam>
                <Slam at={T.tapPay} size={70}>
                  2. PAY
                </Slam>
              </div>
            )}
            {v && (
              <Slam at={frame >= T.paid ? T.paid : frame >= T.tapPay ? T.tapPay : T.tapBuy} size={80}>
                {frame >= T.paid ? "USDC LANDS ON ARC" : frame >= T.tapPay ? "2. PAY" : "1. TAP BUY"}
              </Slam>
            )}
            <Phone scale={v ? 1.05 : 1.08} />
            {!v && (
              <div style={{ width: 520, display: "flex", flexDirection: "column", gap: 18 }}>
                <Slam at={T.paid} size={70} color={LIME}>
                  3. USDC LANDS
                </Slam>
                <Slam at={T.paid + 8} size={70} color={LIME}>
                  ON ARC
                </Slam>
                <Slam at={T.autopilot} size={70}>
                  4. AGENT GOES
                </Slam>
              </div>
            )}
            {v && frame >= T.autopilot && (
              <Slam at={T.autopilot} size={80} color={LIME}>
                AGENT GOES ▶
              </Slam>
            )}
          </AbsoluteFill>
        )}

        {/* D. The drop */}
        {afterDrop && (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: "0 30px" }}>
            {frame < T.go ? (
              DROP.map((w, i) => (
                <Slam key={w} at={T.drop + i * BEAT * 2} size={v ? 118 : 160} color={fg}>
                  {w}
                </Slam>
              ))
            ) : (
              <>
                <Slam at={T.go} size={v ? 150 : 200} color={fg}>
                  JUST FUND
                </Slam>
                <Slam at={T.go + BEAT} size={v ? 150 : 200} color={INK} bg={LIME}>
                  &amp; GO.
                </Slam>
              </>
            )}
          </AbsoluteFill>
        )}

        {/* E. Fuci on Arc */}
        {frame >= T.end && (
          <AbsoluteFill style={{ background: INK, alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: v ? 28 : 24, transform: `scale(${0.8 + 0.2 * end})`, opacity: end }}>
              <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
                <Frond size={v ? 110 : 120} draw={false} />
                <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 110 : 130, color: "#fff", letterSpacing: -3 }}>fuci</span>
                <span style={{ fontFamily: F.display, fontWeight: 500, fontSize: v ? 70 : 80, color: LIME }}>on</span>
                <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: v ? 110 : 130, color: "#fff", letterSpacing: -3 }}>Arc</span>
              </div>
              <div style={{ padding: "12px 26px", borderRadius: 999, background: LIME, color: INK, fontFamily: F.display, fontWeight: 700, fontSize: v ? 38 : 40 }}>
                Embedded Onramp Kit · powered by Arc
              </div>
              <div style={{ fontFamily: F.body, fontSize: v ? 36 : 36, color: "#d4d4d4", textAlign: "center", padding: "0 30px" }}>Debit card · bank transfer → USDC in your agent</div>
              <div style={{ fontFamily: F.mono, fontSize: v ? 38 : 36, color: LIME, letterSpacing: 2 }}>fuci.family</div>
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>

    </AbsoluteFill>
  );
};
