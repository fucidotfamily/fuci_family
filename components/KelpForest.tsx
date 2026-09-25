"use client";

import { useEffect, useRef } from "react";

/**
 * The Living Kelp Forest. Every recorded x402 payment / agent adds a fucus
 * frond (dichotomous branches + paired air bladders); each new settlement
 * releases a burst of bubbles. Canvas, DPR-aware, theme-aware, and static
 * when the user prefers reduced motion.
 */

type Frond = {
  x: number; // 0..1 across the width
  h: number; // 0..1 of canvas height
  layer: number; // 0 back .. 2 front
  phase: number;
  born: number; // ms timestamp, for the grow-in animation
  seed: number;
};

type Bubble = { x: number; y: number; r: number; vy: number; wobble: number; life: number };

const MAX_FRONDS = 90;

function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function makeFrond(i: number, now: number, grow: boolean): Frond {
  const layer = i % 3;
  return {
    x: rand(i + 1) * 1.04 - 0.02,
    h: 0.3 + rand(i + 7) * 0.38 + layer * 0.1,
    layer,
    phase: rand(i + 13) * Math.PI * 2,
    born: grow ? now : now - 10_000,
    seed: i,
  };
}

export function KelpForest({ fronds, pulse, className }: { fronds: number; pulse: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ fronds: [] as Frond[], bubbles: [] as Bubble[], pulse: 0, target: 0 });

  // Keep the target frond count / bubble pulses in a ref so the loop doesn't restart.
  useEffect(() => {
    state.current.target = Math.min(MAX_FRONDS, Math.max(12, fronds));
  }, [fronds]);

  useEffect(() => {
    const s = state.current;
    const bursts = pulse - s.pulse;
    s.pulse = pulse;
    if (bursts <= 0 || !s.fronds.length) return;
    for (let b = 0; b < Math.min(bursts, 6); b++) {
      const f = s.fronds[Math.floor(Math.random() * s.fronds.length)];
      for (let k = 0; k < 10; k++) {
        s.bubbles.push({ x: f.x + (Math.random() - 0.5) * 0.02, y: 1 - f.h * 0.9, r: 1.5 + Math.random() * 3.5, vy: 0.0009 + Math.random() * 0.0012, wobble: Math.random() * 6, life: 1 });
      }
    }
  }, [pulse]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let colors = readColors();
    const themeTimer = window.setInterval(() => (colors = readColors()), 1000);

    let raf = 0;
    const draw = (now: number) => {
      // Grow toward the target frond count, one new frond at a time.
      if (s.fronds.length < s.target && (s.fronds.length < 12 || now - (s.fronds.at(-1)?.born ?? 0) > 220)) {
        s.fronds.push(makeFrond(s.fronds.length, now, s.fronds.length >= 12));
      }

      ctx.clearRect(0, 0, w, h);
      const t = reduced ? 0 : now / 1000;

      for (let layer = 0; layer < 3; layer++) {
        ctx.globalAlpha = 0.45 + layer * 0.27;
        for (const f of s.fronds) {
          if (f.layer !== layer) continue;
          const grow = Math.min(1, (now - f.born) / 1600);
          const eased = 1 - Math.pow(1 - grow, 3);
          drawFrond(ctx, f.x * w, h + 4, f.h * h * eased, f, t, colors, layer);
        }
      }
      ctx.globalAlpha = 1;

      // Ambient bubbles.
      if (!reduced && Math.random() < 0.06 && s.fronds.length) {
        const f = s.fronds[Math.floor(Math.random() * s.fronds.length)];
        s.bubbles.push({ x: f.x, y: 1 - f.h * 0.8, r: 1 + Math.random() * 2.2, vy: 0.0006 + Math.random() * 0.0008, wobble: Math.random() * 6, life: 1 });
      }
      ctx.strokeStyle = colors.bubble;
      ctx.lineWidth = 1.2;
      for (const b of s.bubbles) {
        if (!reduced) {
          b.y -= b.vy * 1.6;
          b.life -= 0.0025;
        }
        const bx = b.x * w + Math.sin(t * 2 + b.wobble) * 4;
        ctx.globalAlpha = Math.max(0, Math.min(1, b.life * 1.4));
        ctx.beginPath();
        ctx.arc(bx, b.y * h, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      s.bubbles = s.bubbles.filter((b) => b.y > -0.05 && b.life > 0).slice(-400);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(themeTimer);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

type Colors = { a: string; b: string; glow: string; bubble: string };

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  return {
    a: cs.getPropertyValue("--frond-a").trim() || "#3a3a3a",
    b: cs.getPropertyValue("--frond-b").trim() || "#5a5a5a",
    glow: cs.getPropertyValue("--glow").trim() || "#ffffff",
    bubble: cs.getPropertyValue("--bubble").trim() || "rgba(255,255,255,.45)",
  };
}

/** Fucus thallus: a flat strap that forks in two (dichotomous), with paired bladders. */
function drawFrond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  f: Frond,
  t: number,
  c: Colors,
  layer: number,
) {
  if (height < 4) return;
  const width = 4.5 + layer * 2.4;
  const sway = Math.sin(t * 0.9 + f.phase) * 0.12 + Math.sin(t * 0.37 + f.phase * 2) * 0.05;
  branch(ctx, x, y, -Math.PI / 2, height * 0.42, width, 0, 3, sway, f.seed, c, t);
}

function branch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  width: number,
  depth: number,
  maxDepth: number,
  sway: number,
  seed: number,
  c: Colors,
  t: number,
) {
  const bend = angle + sway * (depth + 1) * 0.5;
  const cx = x + Math.cos(angle) * len * 0.5 + Math.sin(t + seed) * 1.5;
  const cy = y + Math.sin(angle) * len * 0.5;
  const ex = x + Math.cos(bend) * len;
  const ey = y + Math.sin(bend) * len;

  ctx.strokeStyle = depth % 2 ? c.b : c.a;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(cx, cy, ex, ey);
  ctx.stroke();

  // Paired air bladders along the strap.
  if (depth >= 1 && rand(seed + depth * 17) > 0.35) {
    const bx = (x + ex) / 2;
    const by = (y + ey) / 2;
    const nx = Math.cos(bend + Math.PI / 2) * width * 0.9;
    const ny = Math.sin(bend + Math.PI / 2) * width * 0.9;
    ctx.fillStyle = c.b;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(bx + nx * sgn, by + ny * sgn, width * 0.75, width * 1.3, bend, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (depth >= maxDepth) {
    // Swollen receptacle tips glow faintly: the "live" part of the frond.
    ctx.fillStyle = c.glow;
    ctx.globalAlpha *= 0.55;
    ctx.beginPath();
    ctx.ellipse(ex, ey, width * 0.7, width * 1.4, bend + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha /= 0.55;
    return;
  }
  const spread = 0.2 + rand(seed + depth) * 0.16;
  const next = len * (0.72 + rand(seed * 3 + depth) * 0.12);
  branch(ctx, ex, ey, bend - spread, next, width * 0.78, depth + 1, maxDepth, sway, seed + 1, c, t);
  branch(ctx, ex, ey, bend + spread, next, width * 0.78, depth + 1, maxDepth, sway, seed + 2, c, t);
}
