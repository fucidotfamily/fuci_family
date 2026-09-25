import { SITE_URL, X402_NETWORK, X_URL } from "./config";
import { AGENT_REGISTRY_REF } from "./erc8004";
import { TOOLS } from "./tools";

/**
 * ERC-8004 agent registration file (the JSON an agent's tokenURI points to).
 * https://eips.ethereum.org/EIPS/eip-8004#agent-uri-and-agent-registration-file
 */
export function registrationFile(opts: {
  name: string;
  description: string;
  image: string;
  agentId: number | null;
  web: string;
  house: boolean;
  x?: string;
  /** Set for agents created through the Fuci factory: listed as a "Created with" service. */
  createdWith?: string;
  /** This agent's own A2A endpoint (Fuci agents get one automatically). */
  a2a?: string;
  /** The owner's own links (website, MCP, A2A) and skill names. */
  profile?: { website?: string; mcp?: string; a2a?: string; skills?: string[] };
}) {
  const p = opts.profile ?? {};
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: opts.name,
    description: opts.description,
    image: opts.image,
    services: [
      { name: "web", endpoint: opts.web },
      ...(opts.createdWith ? [{ name: "Created with", endpoint: opts.createdWith }] : []),
      ...(p.website ? [{ name: "website", endpoint: p.website }] : []),
      ...(p.mcp ? [{ name: "MCP", endpoint: p.mcp, version: "2025-06-18" }] : []),
      ...(p.a2a ? [{ name: "A2A", endpoint: p.a2a, version: "0.3.0" }] : opts.a2a ? [{ name: "A2A", endpoint: opts.a2a, version: "0.3.0" }] : []),
      ...(opts.x ? [{ name: "X", endpoint: `https://x.com/${opts.x}` }] : opts.house ? [{ name: "X", endpoint: X_URL }] : []),
      ...(p.mcp ? [] : [{ name: "MCP", endpoint: `${SITE_URL}/api/mcp`, version: "2025-06-18" }]),
      { name: "x402", endpoint: `${SITE_URL}/.well-known/x402`, network: X402_NETWORK },
      { name: "llms.txt", endpoint: `${SITE_URL}/llms.txt` },
    ],
    skills: [
      ...(p.skills ?? []).map((s, i) => ({ id: `custom_${i + 1}`, name: s })),
      ...TOOLS.map((t) => ({ id: t.id, name: t.name, description: t.description, price: `${t.price} USDC`, endpoint: `${SITE_URL}${t.path}` })),
    ],
    x402Support: true,
    active: true,
    registrations: opts.agentId === null ? [] : [{ agentId: opts.agentId, agentRegistry: AGENT_REGISTRY_REF }],
    supportedTrust: ["reputation", "validation"],
  };
}
