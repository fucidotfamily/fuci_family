/**
 * Fuci Risk: shared types and grading. A report is a set of factors, each scored 0–100 from real data
 * (higher = lower risk) or null when the data isn't available. Unknown factors are left out of the
 * score and lower the confidence instead of being guessed. Red flags can cap the grade.
 */

export type Evidence = { label: string; href?: string };

export type Factor = {
  key: string;
  label: string;
  /** 0–100, higher is safer; null = not enough data. */
  score: number | null;
  weight: number;
  /** One plain-English sentence. */
  summary: string;
  details: string[];
  evidence?: Evidence[];
};

export type Grade = "A" | "B" | "C" | "D" | "F";

export type RiskReport = {
  kind: "token" | "protocol";
  id: string;
  name: string;
  symbol?: string;
  /** Weighted score over the known factors, 0–100. */
  score: number | null;
  grade: Grade | null;
  label: string;
  confidence: "High" | "Medium" | "Low";
  /** Share of the total weight that had data, 0–1. */
  coverage: number;
  redFlags: string[];
  /** Rules that held the grade below its score, e.g. "a token under a week old (max C)". */
  limits: string[];
  factors: Factor[];
  sources: Evidence[];
  generatedAt: number;
  /** Arc block the chain reads were made at, for tokens. */
  block?: number;
  /** A check was still running (e.g. a long holder history); the report is cached only briefly. */
  partial?: boolean;
};

export const GRADE_LABEL: Record<Grade, string> = {
  A: "Lower risk",
  B: "Moderate risk",
  C: "Elevated risk",
  D: "High risk",
  F: "Very high risk",
};

const ORDER: Grade[] = ["A", "B", "C", "D", "F"];

export function gradeOf(score: number): Grade {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

/** Worse of two grades. */
const worst = (a: Grade, b: Grade) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

export const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Pick the first band whose threshold `v` is below (bands sorted ascending by `below`). */
export function band(v: number, bands: [below: number, score: number][], above: number) {
  for (const [below, s] of bands) if (v < below) return s;
  return above;
}

/** Combine factors into a report: weighted score, grade (capped by `caps`), confidence from coverage. */
export function finish(
  base: Omit<RiskReport, "score" | "grade" | "label" | "confidence" | "coverage" | "generatedAt" | "limits">,
  caps: { grade: Grade; reason: string }[] = [],
): RiskReport {
  const total = base.factors.reduce((s, f) => s + f.weight, 0);
  const known = base.factors.filter((f) => f.score !== null);
  const knownWeight = known.reduce((s, f) => s + f.weight, 0);
  const coverage = total ? knownWeight / total : 0;
  const score = knownWeight ? clamp100(known.reduce((s, f) => s + (f.score as number) * f.weight, 0) / knownWeight) : null;
  const raw: Grade | null = score === null ? null : gradeOf(score);
  let grade = raw;
  const limits: string[] = [];
  if (raw) {
    // Every rule stricter than the score's own grade is listed, not just the one that bit first.
    for (const c of caps) {
      if (worst(raw, c.grade) !== raw) limits.push(`${c.reason[0].toUpperCase()}${c.reason.slice(1)} (max ${c.grade})`);
      grade = worst(grade as Grade, c.grade);
    }
  }
  // Too little data for a fair grade: show the score, but no letter.
  if (coverage < 0.4) {
    grade = null;
    limits.push("Too few checks had data to grade fairly");
  }
  const confidence = coverage >= 0.8 ? "High" : coverage >= 0.55 ? "Medium" : "Low";
  return {
    ...base,
    score,
    grade,
    label: grade ? GRADE_LABEL[grade] : "Not enough data",
    confidence,
    coverage: Math.round(coverage * 100) / 100,
    redFlags: base.redFlags,
    limits,
    generatedAt: Date.now(),
  };
}

export const usd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;

export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

export const DAY = 86_400_000;
