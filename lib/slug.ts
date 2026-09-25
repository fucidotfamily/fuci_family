/** Agent URLs: fuci.family/agent/<name>. Shared by server and browser code. */

/** Paths under /api/agent/ and similar that an agent name must not shadow. */
const RESERVED = new Set(["run", "by-owner", "card", "new", "api", "admin", "setup", "spawn", "agent", "agents", "jobs", "docs"]);

/** Brand names only Fuci's own wallet may take, so nobody else can pose as Fuci. */
const BRAND = new Set(["fuci", "house", "fuci-agent", "fuci-official", "fucidotfamily"]);

/** The wallet that owns Fuci (factory owner and Safe signer). NEXT_PUBLIC_FUCI_OWNER overrides it. */
export const FUCI_OWNER = (process.env.NEXT_PUBLIC_FUCI_OWNER || "0x900c41EDa7013b1E1c1Ad3AF3c47188A04A2160A").toLowerCase();

/** The URL id for an agent name: lowercase letters, digits and dashes, 2–24 characters. */
export function slugOf(name: string, owner?: string | null) {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24).replace(/-$/, "");
  if (slug.length < 2 || RESERVED.has(slug)) return null;
  if (BRAND.has(slug) && owner?.toLowerCase() !== FUCI_OWNER) return null;
  return slug;
}

