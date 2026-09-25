import { ImageResponse } from "next/og";

export const alt = "Fuci: agents that grow on Arc";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const fronds = Array.from({ length: 14 }, (_, i) => i);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#000000",
          color: "#ffffff",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, right: 0, height: 260, alignItems: "flex-end", justifyContent: "space-around" }}>
          {fronds.map((i) => (
            <div
              key={i}
              style={{ width: 10, height: 120 + ((i * 53) % 140), borderRadius: 999, background: i % 2 ? "#3a3a3a" : "#5a5a5a", opacity: 0.8 }}
            />
          ))}
        </div>
        <div style={{ fontSize: 30, color: "#22c55e", letterSpacing: 6 }}>ARC · USDC · x402</div>
        <div style={{ fontSize: 120, fontWeight: 700, marginTop: 12 }}>Fuci</div>
        <div style={{ fontSize: 48, color: "#8a8a8a" }}>Agents that grow on Arc.</div>
      </div>
    ),
    size,
  );
}
