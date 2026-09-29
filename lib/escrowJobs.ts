/**
 * Job types a Fuci agent can deliver through escrow. The buyer's form writes the job terms as one tagged
 * line (read by the agent) plus a plain-language line (read by people); both are part of the hashed terms.
 * Shared by the form (browser) and the escrow worker (server), so it imports nothing server-only.
 */

export type JobSpec =
  | { type: "report"; prompt: string }
  | { type: "risk"; target: string }
  | { type: "kya"; agent: string }
  | { type: "daily"; prompt: string; days: number };

export type JobType = JobSpec["type"];

export const JOB_TYPES: { type: JobType; label: string; hint: string }[] = [
  { type: "report", label: "Report", hint: "One answer to your question" },
  { type: "risk", label: "Token risk", hint: "A–F risk grade with sources" },
  { type: "kya", label: "Agent check", hint: "A–F trust grade for an agent" },
  { type: "daily", label: "Daily reports", hint: "One report a day" },
];

export const DAILY_DAYS = [3, 7] as const;
/** Per delivery: about 0.04 USDC of data plus gas, with a margin for the agent. */
export const MIN_PER_DELIVERY = 0.1;
export const MAX_PROMPT = 450;

const TAG = "[fuci-job] ";

export const minUsdcFor = (spec: JobSpec) => Math.round((spec.type === "daily" ? MIN_PER_DELIVERY * spec.days : MIN_PER_DELIVERY) * 100) / 100;

/** Deadline for the delivery, in days: a daily job needs its days plus a day's margin. */
export const deadlineDaysFor = (spec: JobSpec, chosen: number) => (spec.type === "daily" ? spec.days + 1 : chosen);

export function describe(spec: JobSpec): string {
  switch (spec.type) {
    case "report":
      return `Report: ${spec.prompt}`;
    case "risk":
      return `Token risk report for ${spec.target}`;
    case "kya":
      return `Agent check (Know Your Agent) for ${spec.agent}`;
    case "daily":
      return `Daily reports for ${spec.days} days: ${spec.prompt}`;
  }
}

/** The terms text that is hashed on-chain: the tagged line for the agent, then the same job in words. */
export const encodeTerms = (spec: JobSpec) => `${TAG}${JSON.stringify(spec)}\n${describe(spec)}`;

/** The job a Fuci agent should do. Terms without a tag (older jobs, other clients) are a plain report. */
export function parseTerms(text: string): JobSpec {
  const first = text.split("\n", 1)[0];
  if (first.startsWith(TAG)) {
    try {
      const s = JSON.parse(first.slice(TAG.length)) as Partial<JobSpec> & { type?: string };
      const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_PROMPT) : "");
      if (s.type === "risk" && str((s as { target?: unknown }).target)) return { type: "risk", target: str((s as { target: unknown }).target) };
      if (s.type === "kya" && str((s as { agent?: unknown }).agent)) return { type: "kya", agent: str((s as { agent: unknown }).agent) };
      if (s.type === "daily" && str((s as { prompt?: unknown }).prompt)) {
        const days = Number((s as { days?: unknown }).days);
        return { type: "daily", prompt: str((s as { prompt: unknown }).prompt), days: (DAILY_DAYS as readonly number[]).includes(days) ? days : 3 };
      }
      if (s.type === "report" && str((s as { prompt?: unknown }).prompt)) return { type: "report", prompt: str((s as { prompt: unknown }).prompt) };
    } catch {
      // not a valid tag: fall through to a plain report
    }
  }
  return { type: "report", prompt: humanTerms(text).slice(0, MAX_PROMPT) };
}

/** The terms without the machine line, for people. */
export const humanTerms = (text: string) => (text.startsWith(TAG) ? text.split("\n").slice(1).join("\n") : text);
