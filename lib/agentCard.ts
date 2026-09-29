import { SITE_URL, X402_NETWORK, X_URL } from "./config";
import { AGENT_REGISTRY_REF } from "./erc8004";
import { TOOLS } from "./tools";
import { MCP_PROMPTS, MCP_TOOL_NAMES } from "./mcpCatalog";

/** OASF skill and domain paths (https://github.com/agntcy/oasf), read by explorers such as 8004scan. */
const OASF_SKILLS = [
  "natural_language_processing/information_retrieval_and_synthesis/question_answering",
  "natural_language_processing/information_retrieval_and_synthesis/search",
  "natural_language_processing/natural_language_understanding/contextual_comprehension",
  "natural_language_processing/natural_language_generation/text_generation",
  "natural_language_processing/conversation/chatbot",
  "natural_language_processing/analytical_and_logical_reasoning/problem_solving",
  "tool_interaction/automation/workflow_automation",
];
const OASF_DOMAINS = ["technology/blockchain/cryptocurrency", "technology/blockchain/smart_contracts", "finance_and_business/finance", "finance_and_business/finance/digital_payments"];
const TAGS = ["arc", "x402", "usdc", "ai-agent", "trading", "autopilot", "dca", "earn", "market-data", "erc-8004", "mcp", "a2a"];

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
      ...(p.a2a
        ? [{ name: "A2A", endpoint: p.a2a, version: "0.3.0" }]
        : opts.a2a
          ? [{ name: "A2A", endpoint: opts.a2a, version: "0.3.0", a2aSkills: [...OASF_SKILLS, ...OASF_DOMAINS.slice(0, 2)] }]
          : []),
      ...(opts.x ? [{ name: "X", endpoint: `https://x.com/${opts.x}` }] : opts.house ? [{ name: "X", endpoint: X_URL }] : []),
      ...(p.mcp ? [] : [{ name: "MCP", endpoint: `${SITE_URL}/api/mcp`, version: "2025-06-18", mcpTools: MCP_TOOL_NAMES, mcpPrompts: MCP_PROMPTS.map((m) => m.name) }]),
      { name: "OASF", endpoint: "https://github.com/agntcy/oasf/", version: "v0.8.0", skills: OASF_SKILLS, domains: OASF_DOMAINS },
      { name: "x402", endpoint: `${SITE_URL}/.well-known/x402`, network: X402_NETWORK },
      { name: "llms.txt", endpoint: `${SITE_URL}/llms.txt` },
    ],
    skills: [
      ...(p.skills ?? []).map((s, i) => ({ id: `custom_${i + 1}`, name: s })),
      ...TOOLS.map((t) => ({ id: t.id, name: t.name, description: t.description, price: `${t.price} USDC`, endpoint: `${SITE_URL}${t.path}` })),
    ],
    tags: [...new Set([...TAGS, ...(p.skills ?? []).map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-")).filter(Boolean)])].slice(0, 16),
    version: "1.1.0",
    updatedAt: Math.floor(Date.now() / 1000),
    agent_type: "service",
    x402Support: true,
    active: true,
    registrations: opts.agentId === null ? [] : [{ agentId: opts.agentId, agentRegistry: AGENT_REGISTRY_REF }],
    supportedTrust: ["reputation", "validation"],
  };
}
