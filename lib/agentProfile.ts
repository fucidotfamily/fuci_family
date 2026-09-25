/**
 * The public profile an owner sets for their agent's ERC-8004 registration file (the JSON its
 * on-chain tokenURI points to). Shared by the browser (the owner signs it) and the server.
 */

export type AgentProfile = {
  description?: string;
  /** The owner's own site for the agent. */
  website?: string;
  /** Endpoints other agents can call. */
  mcp?: string;
  a2a?: string;
  /** Short skill names, e.g. "Argus launch alerts". */
  skills?: string[];
};

export const PROFILE_LIMITS = { description: 500, url: 200, skills: 8, skill: 40 } as const;

function url(v: unknown, label: string) {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  const s = String(v).trim();
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`${label}: enter a full https:// link`);
  }
  if (u.protocol !== "https:") throw new Error(`${label}: use an https:// link`);
  if (s.length > PROFILE_LIMITS.url) throw new Error(`${label}: keep it under ${PROFILE_LIMITS.url} characters`);
  return u.toString();
}

/** Clean up the form; throws a readable error for anything invalid. */
export function normalizeProfile(p: Partial<AgentProfile>): AgentProfile {
  const description = String(p.description ?? "").replace(/\s+/g, " ").trim();
  if (description.length > PROFILE_LIMITS.description) throw new Error(`Description: keep it under ${PROFILE_LIMITS.description} characters`);
  const skills = (Array.isArray(p.skills) ? p.skills : [])
    .map((s) => String(s).replace(/\s+/g, " ").trim().slice(0, PROFILE_LIMITS.skill))
    .filter(Boolean)
    .filter((s, i, all) => all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
    .slice(0, PROFILE_LIMITS.skills);
  const out: AgentProfile = {
    ...(description ? { description } : {}),
    ...(url(p.website, "Website") ? { website: url(p.website, "Website") } : {}),
    ...(url(p.mcp, "MCP endpoint") ? { mcp: url(p.mcp, "MCP endpoint") } : {}),
    ...(url(p.a2a, "A2A endpoint") ? { a2a: url(p.a2a, "A2A endpoint") } : {}),
    ...(skills.length ? { skills } : {}),
  };
  return out;
}

/** The exact text the owner signs, so a signature can't be replayed for another profile. */
export const profileDetail = (p: AgentProfile) => JSON.stringify(p);
