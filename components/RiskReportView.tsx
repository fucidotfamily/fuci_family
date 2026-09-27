import type { Grade, RiskReport } from "@/lib/risk/score";

/** Grade colours, readable on both themes. */
export const GRADE_COLOR: Record<Grade, string> = {
  A: "#16a34a",
  B: "#65a30d",
  C: "#d97706",
  D: "#ea580c",
  F: "#dc2626",
};
const scoreColor = (s: number) => (s >= 80 ? GRADE_COLOR.A : s >= 65 ? GRADE_COLOR.B : s >= 50 ? GRADE_COLOR.C : s >= 35 ? GRADE_COLOR.D : GRADE_COLOR.F);

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

/** A full Fuci Risk report: grade, red flags, every factor with its reasons and sources. */
export function RiskReportView({ r }: { r: RiskReport }) {
  const color = r.grade ? GRADE_COLOR[r.grade] : "var(--muted)";
  return (
    <article className="mt-8" aria-labelledby="risk-name">
      {/* Headline */}
      <div className="card flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-6">
        <div
          className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-md border-2"
          style={{ borderColor: color, color }}
          aria-label={r.grade ? `Grade ${r.grade}` : "No grade"}
        >
          <span className="font-display text-5xl font-bold leading-none">{r.grade ?? "?"}</span>
          {r.score !== null && <span className="mt-1 font-mono text-xs">{r.score}/100</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{r.kind === "token" ? "Token on Arc" : "DeFi protocol"}</p>
          <h2 id="risk-name" className="font-display mt-1 truncate text-3xl font-semibold tracking-tight">
            {r.name}
            {r.symbol && r.symbol !== r.name ? <span className="text-ink-2"> · {r.symbol}</span> : null}
          </h2>
          <p className="mt-1 text-lg font-medium" style={{ color }}>
            {r.label}
          </p>
          <p className="mt-2 text-sm text-ink-2">
            Confidence: <b className="text-ink">{r.confidence}</b> · {Math.round(r.coverage * 100)}% of checks had data
            {r.kind === "token" ? <span className="block break-all font-mono text-xs text-muted">{r.id}</span> : null}
          </p>
        </div>
      </div>

      {r.partial && (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-line p-4 text-sm text-ink-2" role="status">
          <span className="live-dot" /> Part of this check is still running (a long transfer history). Refresh in a minute for the full report; it picks up where it stopped.
        </p>
      )}

      {/* Red flags */}
      {r.redFlags.length > 0 && (
        <div className="mt-3 rounded-md border p-4 sm:p-5" style={{ borderColor: `${GRADE_COLOR.F}55`, background: `${GRADE_COLOR.F}0d` }}>
          <h3 className="font-display font-semibold" style={{ color: GRADE_COLOR.F }}>
            Red flags
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {r.redFlags.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden="true" style={{ color: GRADE_COLOR.F }}>
                  ▲
                </span>
                <span className="min-w-0">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grade limits */}
      {r.limits.length > 0 && (
        <div className="mt-3 rounded-md border p-4 sm:p-5" style={{ borderColor: `${GRADE_COLOR.C}55`, background: `${GRADE_COLOR.C}0d` }}>
          <h3 className="font-display font-semibold" style={{ color: GRADE_COLOR.C }}>
            Why the grade is limited
          </h3>
          <p className="mt-1 text-sm text-ink-2">
            {r.score !== null ? `The checks add up to ${r.score}/100, but these rules keep the grade down until they change:` : "No grade yet:"}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {r.limits.map((l) => (
              <li key={l} className="flex gap-2">
                <span aria-hidden="true" style={{ color: GRADE_COLOR.C }}>
                  ●
                </span>
                <span className="min-w-0">{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Factors */}
      <h3 className="font-display mt-10 text-2xl font-semibold tracking-tight">What we checked</h3>
      <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {r.factors.map((f) => (
          <li key={f.key} className="card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="font-display font-semibold">{f.label}</h4>
              <span className="shrink-0 font-mono text-sm" style={{ color: f.score === null ? "var(--muted)" : scoreColor(f.score) }}>
                {f.score === null ? "Unknown" : `${f.score}/100`}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={f.score === null ? "No data" : `${f.score} out of 100`}>
              {f.score !== null && <div className="h-full rounded-full" style={{ width: `${Math.max(3, f.score)}%`, background: scoreColor(f.score) }} />}
            </div>
            <p className="mt-3 text-sm text-ink">{f.summary}</p>
            {(f.details.length > 0 || (f.evidence?.length ?? 0) > 0) && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-ink-2 hover:text-ink">Details · weight {f.weight}%</summary>
                <ul className="mt-2 space-y-1 text-ink-2">
                  {f.details.map((d) => (
                    <li key={d} className="break-words">
                      {d}
                    </li>
                  ))}
                </ul>
                {f.evidence?.length ? (
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {f.evidence.map((e) =>
                      e.href ? (
                        <a key={e.label} href={e.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                          {e.label} ↗
                        </a>
                      ) : (
                        <span key={e.label}>{e.label}</span>
                      ),
                    )}
                  </p>
                ) : null}
              </details>
            )}
          </li>
        ))}
      </ul>

      {/* Sources */}
      <p className="mt-6 text-xs text-muted">
        Checked {when(r.generatedAt)}
        {r.block ? ` at Arc block ${r.block.toLocaleString("en-US")}` : ""}. Sources:{" "}
        {r.sources.map((s, i) => (
          <span key={s.label}>
            {i ? " · " : ""}
            {s.href ? (
              <a href={s.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                {s.label}
              </a>
            ) : (
              s.label
            )}
          </span>
        ))}
        . Reports refresh every 15 minutes.
      </p>
    </article>
  );
}
