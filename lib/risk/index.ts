import { after } from "next/server";
import { kvGet, kvSet } from "../store";
import { protocolRisk, ProtocolNotFound } from "./protocol";
import type { RiskReport } from "./score";
import { tokenRisk, TokenNotFound } from "./token";

export type { RiskReport } from "./score";
export { searchProtocols, arcProtocols } from "./protocol";
export { categoryHelp } from "./categories";

/** Reports are cached so a shared link or a burst of agent calls doesn't redo the chain scan. */
const TTL_SEC = 15 * 60;

export class RiskInputError extends Error {}

/** `target` is a token address on Arc (0x…) or a DefiLlama protocol slug. */
export async function getRisk(target: string): Promise<RiskReport> {
  const t = target.trim().toLowerCase();
  const isToken = /^0x[0-9a-f]{40}$/.test(t);
  if (!isToken && !/^[a-z0-9][a-z0-9.-]{0,79}$/.test(t)) throw new RiskInputError("Give a token address on Arc (0x…) or a protocol name from DefiLlama");
  const key = `risk:v2:${t}`;
  const hit = await kvGet<RiskReport>(key).catch(() => null);
  if (hit) return hit;
  try {
    const report = isToken ? await tokenRisk(t) : await protocolRisk(t);
    // A report with a check still running is kept for a minute only, so a re-check picks up the rest.
    await kvSet(key, report, report.partial ? 60 : TTL_SEC).catch(() => undefined);
    // Keep scanning after the response with the time left in this invocation; the saved progress
    // (and a finished report, if it gets there) is what the next check reads.
    if (report.partial && isToken)
      after(async () => {
        const more = await tokenRisk(t, { scanBudgetMs: 38_000 }).catch(() => null);
        if (more && !more.partial) await kvSet(key, more, TTL_SEC).catch(() => undefined);
      });
    return report;
  } catch (e) {
    if (e instanceof TokenNotFound || e instanceof ProtocolNotFound) throw new RiskInputError(e.message);
    throw e;
  }
}

/** A report only if one is already cached (no work); used to show grades on lists without waiting. */
export async function cachedRisk(target: string): Promise<RiskReport | null> {
  return kvGet<RiskReport>(`risk:v2:${target.trim().toLowerCase()}`).catch(() => null);
}

/** Compute and cache reports for `targets` in the background (after the response), a few at a time. */
export function warmRisk(targets: string[]) {
  if (!targets.length) return;
  after(async () => {
    for (let i = 0; i < targets.length; i += 3) await Promise.all(targets.slice(i, i + 3).map((t) => getRisk(t).catch(() => null)));
  });
}
