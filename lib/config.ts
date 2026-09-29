import { arc, arcTestnet } from "viem/chains";

/**
 * Central runtime config. Payments need CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET;
 * until they are set, paid endpoints answer 503 "not configured" (no simulation).
 */
export type ArcNetwork = "mainnet" | "testnet";

/** Arc Mainnet by default (real USDC). NEXT_PUBLIC_ARC_NETWORK=testnet switches to Arc Testnet. */
export const ARC_NETWORK: ArcNetwork =
  process.env.NEXT_PUBLIC_ARC_NETWORK === "testnet" ? "testnet" : "mainnet";

export const ARC_CHAIN = ARC_NETWORK === "mainnet" ? arc : arcTestnet;

/** CAIP-2 id used by x402 (e.g. eip155:5042002). */
export const X402_NETWORK = `eip155:${ARC_CHAIN.id}` as const;

/** Circle Gateway chain name used by GatewayClient. */
export const GATEWAY_CHAIN = ARC_NETWORK === "mainnet" ? "arc" : "arcTestnet";

/** Circle Wallets blockchain identifier. */
export const CIRCLE_BLOCKCHAIN =
  ARC_NETWORK === "mainnet" ? "ARC" : "ARC-TESTNET";

/** USDC on Arc (native gas token, ERC-20 interface at this address). */
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;

/**
 * Networks Fuci's paid tools accept (x402 `accepts[]`), Arc first. On mainnet this is every chain
 * Circle Gateway settles batched payments on, all paying the same treasury address (an EOA, so its
 * Gateway balance on any of them can be withdrawn), in USDC. An agent funded on Base can pay as
 * easily as one funded on Arc. Testnet stays Arc-only.
 */
export const X402_NETWORKS: {
  network: `eip155:${number}`;
  name: string;
  usdc: `0x${string}`;
}[] =
  ARC_NETWORK === "mainnet"
    ? [
        { network: "eip155:5042", name: "Arc", usdc: ARC_USDC },
        {
          network: "eip155:8453",
          name: "Base",
          usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        },
        {
          network: "eip155:42161",
          name: "Arbitrum",
          usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        },
        {
          network: "eip155:1",
          name: "Ethereum",
          usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        },
        {
          network: "eip155:10",
          name: "Optimism",
          usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        },
        {
          network: "eip155:137",
          name: "Polygon",
          usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        },
        {
          network: "eip155:43114",
          name: "Avalanche",
          usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        },
        {
          network: "eip155:130",
          name: "Unichain",
          usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
        },
        {
          network: "eip155:480",
          name: "World Chain",
          usdc: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
        },
        {
          network: "eip155:146",
          name: "Sonic",
          usdc: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894",
        },
        {
          network: "eip155:1329",
          name: "Sei",
          usdc: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
        },
        {
          network: "eip155:999",
          name: "HyperEVM",
          usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
        },
      ]
    : [
        {
          network: `eip155:${ARC_CHAIN.id}`,
          name: "Arc Testnet",
          usdc: ARC_USDC,
        },
      ];

export const EXPLORER_URL =
  ARC_CHAIN.blockExplorers?.default.url ?? "https://explorer.arc.io";

/** USDC the house agent may spend per day sponsoring the website playground. */
export const PLAYGROUND_DAILY_USDC = Number(
  process.env.PLAYGROUND_DAILY_USDC || 0.25,
);

/** Fuci's domain as shown on cards. */
export const PUBLIC_DOMAIN = "fuci.family";
/** The canonical site: links, share cards and ERC-8004 registration files all use it. */
export const CANONICAL_URL = "https://www.fuci.family";

/** Fuci on X. */
export const X_HANDLE = "fucidotfamily";
export const X_URL = `https://x.com/${X_HANDLE}`;
export const GITHUB_URL = "https://github.com/fucidotfamily";
/** The project's public contact address (shown on the site for partners, listings and support). */
export const CONTACT_EMAIL = "hello@fuci.family";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL || process.env.NODE_ENV === "production"
    ? CANONICAL_URL
    : "http://localhost:3000");

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

export const TITHE_ADDRESS = (process.env.NEXT_PUBLIC_TITHE_ADDRESS ||
  ZERO_ADDRESS) as `0x${string}`;
/** 5% of every x402 payment is pledged to kelp restoration. */
export const TITHE_BPS = 500;
/** $FUCI on Argus (launched 2026-09-24); NEXT_PUBLIC_FUCI_TOKEN overrides it. */
const FUCI_ENV = (process.env.NEXT_PUBLIC_FUCI_TOKEN ?? "").replace(
  /["'\s]/g,
  "",
);
export const FUCI_TOKEN = (
  /^0x[0-9a-fA-F]{40}$/.test(FUCI_ENV)
    ? FUCI_ENV.toLowerCase()
    : "0xe66d5169c5d235209d74e976e594060c44c64420"
) as `0x${string}`;
/** The $FUCI section is shown before launch ("coming soon"); the live address and price appear once NEXT_PUBLIC_FUCI_TOKEN is set. */
export const SHOW_FUCI_TOKEN = true;

/** $FUCI's launch settings on Argus (argus.world/create), shown in the $FUCI section. */
export const FUCI_LAUNCH = {
  buyTaxPct: 1,
  sellTaxPct: 1,
  /** How the creator's share of every tax is split (Argus keeps `argusCutPct` of the tax first). */
  split: { creatorPct: 10, dividendsPct: 90, buybackPct: 0, liquidityPct: 0 },
  argusCutPct: 10,
  devBuyPct: 3,
  supply: 1_000_000_000,
  creatorFundsTo: { label: "github.com/fucidotfamily", url: GITHUB_URL },
  /** The dev wallet's whole $FUCI bag, locked on Argus for a year. */
  devLock: {
    tokens: 27_901_211,
    until: "Sep 25, 2027",
    period: "1 year",
    url: "https://argus.world/lock",
  },
} as const;

/** Circle wallets are live once the API key and entity secret are set. */
export const CIRCLE_LIVE = Boolean(
  process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET,
);

/** Self-managed agent key (a plain EOA). Gateway nanopayments need no Circle account. */
export const SELF_MANAGED = /^0x[0-9a-fA-F]{64}$/.test(
  (process.env.AGENT_PRIVATE_KEY ?? "").trim(),
);

/** RPC for the payments chain (Arc); defaults to the public endpoint. */
export const ARC_RPC_URL =
  process.env.ARC_RPC_URL || ARC_CHAIN.rpcUrls.default.http[0];

const SELLER_ENV = (process.env.FUCI_SELLER_ADDRESS ?? "").trim();
/** The owner's own wallet (receives payments, signs in to /setup). */
export const OWNER_ADDRESS = /^0x[0-9a-fA-F]{40}$/.test(SELLER_ENV)
  ? (SELLER_ENV as `0x${string}`)
  : null;
/**
 * Live x402 selling: payments go to FUCI_SELLER_ADDRESS, or to the auto-created
 * Circle treasury wallet (see lib/circle.ts sellerAddress()).
 */
export const X402_LIVE = /^0x[0-9a-fA-F]{40}$/.test(SELLER_ENV) || CIRCLE_LIVE;

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (addr: string) =>
  `${EXPLORER_URL}/address/${addr}`;

/**
 * Fuci's treasury: a Safe multisig on Arc that receives the agent-creation fees (via the factory)
 * and the 1% trade fees. NEXT_PUBLIC_FUCI_TREASURY (or FUCI_TREASURY on the server) overrides it.
 */
const TREASURY_ENV = (
  process.env.NEXT_PUBLIC_FUCI_TREASURY ||
  process.env.FUCI_TREASURY ||
  ""
).trim();
export const FUCI_TREASURY = (
  /^0x[0-9a-fA-F]{40}$/.test(TREASURY_ENV)
    ? TREASURY_ENV
    : "0x039a30f17a7d71582B648bE4c1dF9aB3a08a5F75"
) as `0x${string}`;
