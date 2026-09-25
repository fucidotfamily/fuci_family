import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { ARC_CHAIN, ARC_USDC, EXPLORER_URL, FUCI_TREASURY, GATEWAY_CHAIN, X402_NETWORK } from "@/lib/config";
import { requestOrigin } from "@/lib/requestOrigin";
import { TOOLS } from "@/lib/tools";
import { ERC8004 } from "@/lib/erc8004Abi";
import { ARGUS } from "@/lib/argus";
import { V4 } from "@/lib/trade";
import { factoryAddress } from "@/lib/factory";
import { RULE_LABEL, TRADE_FEE_PCT } from "@/lib/tradingRules";

export const metadata: Metadata = {
  title: "Docs",
  description: "How to use Fuci (spawn an agent, ask, trade, autopilot) and how to build with it (x402, MCP, APIs, contracts).",
};
export const dynamic = "force-dynamic";

const NAV = [
  {
    group: "Use Fuci",
    items: [
      ["start", "Start here"],
      ["spawn", "1 · Spawn an agent"],
      ["ask", "2 · Ask and trade a token"],
      ["autopilot", "3 · Autopilot"],
      ["onchain", "4 · Put it on-chain"],
      ["costs", "Costs"],
      ["safety", "Safety"],
    ],
  },
  {
    group: "Build with Fuci",
    items: [
      ["x402", "How paying works"],
      ["mcp", "MCP (Claude, Cursor)"],
      ["gateway", "Pay with Circle Gateway"],
      ["fetch", "Pay with @x402/fetch"],
      ["sell", "Sell your own tool"],
      ["tools", "Paid tools"],
      ["api", "Free APIs"],
      ["contracts", "Contracts"],
    ],
  },
] as const;

const RULE_HELP: Record<keyof typeof RULE_LABEL, string> = {
  "snipe-new": "Buys each new Argus launch once, for the amount you set, about 20 seconds after launch (past Argus' snipe tax). Skips tokens whose buy tax is above your limit (default 5%).",
  "buy-graduated": "Buys a token once, right after it bonds (its price crosses the bond tick Argus set at launch). Same tax limit.",
  "limit-buy": "Buys one token once, when its price drops to your target. Set it from the token card.",
  "limit-sell": "Sells part or all of a token the agent holds, once the price reaches your target.",
  "take-profit": "Sells part of any position once it is up by your percent (fires once per position).",
  "stop-loss": "Sells the whole position once it is down by your percent.",
  "dev-sell": "Sells the whole position when the token's creator sells theirs.",
};

function H2({ id, kicker, children }: { id: string; kicker?: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24">
      {kicker && <p className="eyebrow">{kicker}</p>}
      <h2 className="font-display mt-2 text-3xl font-semibold tracking-tight">{children}</h2>
    </div>
  );
}

function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="font-display mt-12 scroll-mt-24 text-xl font-semibold">
      {children}
    </h3>
  );
}

function Code({ title, lang, body }: { title?: string; lang: string; body: string }) {
  return (
    <div className="card mt-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">{title ?? lang}</span>
        <CopyButton text={body} />
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-6 text-ink-2">
        <code>{body}</code>
      </pre>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-4 space-y-3">
      {items.map((it, i) => (
        <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-3 text-ink-2">
          <span className="flex size-7 items-center justify-center rounded-full border border-line font-mono text-xs text-ink">{i + 1}</span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}

function Addr({ a }: { a: string }) {
  return (
    <a className="break-all font-mono text-xs underline" href={`${EXPLORER_URL}/address/${a}`} target="_blank" rel="noreferrer">
      {a}
    </a>
  );
}

export default async function DocsPage() {
  const SITE = await requestOrigin();
  const factory = await factoryAddress().catch(() => null);

  const contracts: [string, string, string][] = [
    ["USDC (ERC-20 interface, 6 decimals)", ARC_USDC, "Payments, trading, fees"],
    ["Fuci treasury (Safe multisig)", FUCI_TREASURY, "Receives creation and trade fees"],
    ["ERC-8004 Identity Registry", ERC8004.identity, "Agent identities (NFTs)"],
    ["ERC-8004 Reputation Registry", ERC8004.reputation, "Ratings from other wallets"],
    ["ERC-8004 Validation Registry", ERC8004.validation, "Re-checked work, 0–100 scores"],
    ...(factory ? [["FuciAgentFactory", factory, "Creates an agent on-chain for its fee, paid to the treasury"] as [string, string, string]] : []),
    ["Argus Portal #8 (current)", ARGUS.portals[0].address, "New launches and each launch's record (dynamic-fee pools)"],
    ["Argus Portal #7", ARGUS.portals[1].address, "Earlier launches (TokenCreated)"],
    ["Uniswap V4 PoolManager", V4.poolManager, "Every Argus pool (fee 1%, one tax hook per launch)"],
    ["Uniswap V4 StateView", ARGUS.stateView, "Pool prices (slot0)"],
    ["Uniswap Universal Router", V4.universalRouter, "Autopilot swaps"],
    ["Uniswap V4 Quoter", V4.quoter, "Price quotes for min-out"],
    ["Permit2", V4.permit2, "Token approvals for the router"],
  ];

  return (
    <main className="depth min-h-dvh">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <header className="max-w-3xl">
          <p className="eyebrow">Docs</p>
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Everything about Fuci, in one page.</h1>
          <p className="mt-4 text-lg text-ink-2">
            Fuci agents live on Arc, Circle&apos;s USDC chain. They pay for data per call over x402 and can trade Argus tokens for you, inside limits you
            set.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <a href="#start" className="card block p-5 transition hover:border-ink">
              <p className="font-semibold">Use Fuci →</p>
              <p className="mt-1 text-sm text-ink-2">Spawn an agent, ask it, trade a token, turn on the autopilot. No code.</p>
            </a>
            <a href="#x402" className="card block p-5 transition hover:border-ink">
              <p className="font-semibold">Build with Fuci →</p>
              <p className="mt-1 text-sm text-ink-2">Call the paid tools from your own agent, install the MCP server, use the APIs.</p>
            </a>
          </div>
        </header>

        <div className="mt-14 grid gap-12 lg:grid-cols-[13rem_1fr]">
          <nav className="hidden lg:block" aria-label="On this page">
            <div className="sticky top-24 space-y-6 text-sm">
              {NAV.map((g) => (
                <div key={g.group}>
                  <p className="eyebrow">{g.group}</p>
                  <ul className="mt-3 space-y-2">
                    {g.items.map(([id, label]) => (
                      <li key={id}>
                        <a href={`#${id}`} className="text-ink-2 hover:text-ink">
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <article className="min-w-0 max-w-3xl">
            {/* ------------------------------------------------------------ USE */}
            <H2 id="start" kicker="Use Fuci">
              Start here
            </H2>
            <p className="mt-4 text-ink-2">
              An agent is a small program with its own USDC wallet. You own it with your wallet (one wallet, one agent). It can answer questions about
              Argus, the token launchpad on Arc, and trade Argus tokens for you. You stay in control: only your wallet&apos;s signature can change its
              settings or withdraw.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["Ask", "Questions about launches, bonding and the market. Pays per call."],
                ["Trade", "Paste a token address: buy now, limit buy, limit sell."],
                ["Autopilot", "Rules that trade on their own, every 5 minutes."],
              ].map(([t, d]) => (
                <div key={t} className="card p-4">
                  <p className="font-semibold">{t}</p>
                  <p className="mt-1 text-sm text-ink-2">{d}</p>
                </div>
              ))}
            </div>

            <H3 id="spawn">1 · Spawn an agent</H3>
            <Steps
              items={[
                <>
                  Open{" "}
                  <a className="underline" href="/spawn">
                    Spawn
                  </a>{" "}
                  and connect a browser wallet (Rabby, MetaMask) or create a passkey wallet.
                </>,
                "Pick a strategy, a daily budget for questions and reports, and a name.",
                <>
                  Sign once. Your agent gets its own page at <code className="font-mono text-ink">{SITE.replace(/^https?:\/\//, "")}/agent/&lt;name&gt;</code>{" "}
                  and its own wallet. Spawning is free.
                </>,
              ]}
            />

            <H3 id="ask">2 · Ask and trade a token</H3>
            <p className="mt-3 text-ink-2">
              On your agent&apos;s page, <b className="text-ink">Put it to work</b> has one box:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-2">
              <li>
                <b className="text-ink">Type a question</b>, like &ldquo;Which token is closest to bonding?&rdquo;. The agent buys the live data it needs
                over x402 and answers. You see every payment step.
              </li>
              <li>
                <b className="text-ink">Paste a token contract address</b> (0x…). A token card shows its price, its buy and sell tax, how close it is to
                bonding and the dev&apos;s address. The owner can then <b className="text-ink">Buy now</b>, place a <b className="text-ink">Limit buy</b> or a{" "}
                <b className="text-ink">Limit sell</b>, or <b className="text-ink">Sell all</b>.
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted">Every Argus token trades on its own Uniswap v4 pool from the first block, with a 1% pool fee plus the buy/sell tax its creator set (fixed forever).</p>

            <H3 id="autopilot">3 · Autopilot</H3>
            <p className="mt-3 text-ink-2">The autopilot trades from the agent&apos;s wallet on its own. It has three steps on the agent page:</p>
            <Steps
              items={[
                <>
                  <b className="text-ink">Fund the agent wallet.</b> Copy its address and send USDC on Arc, or press Fund. Withdraw all returns every USDC and
                  token to you, anytime.
                </>,
                <>
                  <b className="text-ink">Pick what it does.</b> Tick the rules you want and set your limits.
                </>,
                <>
                  <b className="text-ink">Turn it on.</b> It checks the market every 5 minutes.
                </>,
              ]}
            />
            <div className="card mt-5 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-normal">Rule</th>
                    <th className="px-4 py-3 font-normal">What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(RULE_LABEL) as (keyof typeof RULE_LABEL)[]).map((k) => (
                    <tr key={k} className="border-t border-line/60">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{RULE_LABEL[k]}</td>
                      <td className="px-4 py-3 text-ink-2">{RULE_HELP[k]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-ink-2">
              <b className="text-ink">Limits</b> apply to every buy: a max per trade, a max per day, and a slippage cap. Every trade has a minimum
              price from a fresh quote, so if the price moves more than your slippage, the trade cancels instead of filling badly. Sells are never
              blocked by the daily max. What happened shows up in the agent&apos;s History, with a link to each transaction.
            </p>

            <H3 id="onchain">4 · Put it on-chain (optional)</H3>
            <p className="mt-3 text-ink-2">
              Register your agent in Arc&apos;s agent registry (ERC-8004) so other apps can find it and rate it.{" "}
              {factory ? "It costs 1 USDC plus gas, paid once." : "It costs a little gas in USDC."} Registered agents appear in the{" "}
              <a className="underline" href="/agents">
                agent directory
              </a>{" "}
              and can collect on-chain reputation.
            </p>

            <H3 id="costs">Costs</H3>
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <tbody>
                  {[
                    ["Spawn an agent (off-chain)", "Free"],
                    ["Ask your agent", "$0.04 per answer, paid by the agent over x402 (visitors get a few free questions a day)"],
                    ["A scheduled report", "From $0.0005 to about $0.0035 per run, over x402"],
                    ["A trade", `${TRADE_FEE_PCT}% of the trade to Fuci, plus gas (fractions of a cent)`],
                    ["Create it on-chain (ERC-8004)", factory ? "1 USDC once, plus gas" : "Gas only for now (1 USDC once the Fuci factory is live)"],
                    ["Withdraw", "Gas only"],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t border-line/60 first:border-t-0">
                      <td className="px-4 py-3 font-medium">{k}</td>
                      <td className="px-4 py-3 text-ink-2">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-muted">Gas on Arc is paid in USDC, so the agent needs a small USDC balance and nothing else. No USDC yet? Buy it with a debit card, Apple Pay or Google Pay right inside Fuci (Circle Onramp): the USDC lands on Arc in your agent&apos;s wallet or yours.</p>

            <H3 id="safety">Safety</H3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-2">
              <li>
                <b className="text-ink">Only you control it.</b> Changing settings, trading by hand and withdrawing all need a fresh signature from the
                owner wallet.
              </li>
              <li>
                <b className="text-ink">Where the key lives.</b> Fuci&apos;s server holds the agent wallet&apos;s key, encrypted, and uses it only for your
                agent&apos;s calls and trades. Keep small balances: it is pocket money for the agent, not savings.
              </li>
              <li>
                <b className="text-ink">Hard limits.</b> Max per trade, max per day and slippage are enforced on the server for every trade.
              </li>
              <li>
                <b className="text-ink">It stops itself.</b> After 3 failed trades in a row the autopilot pauses and tells you why in History.
              </li>
              <li>
                <b className="text-ink">Not advice.</b> Memecoins can go to zero. Never fund an agent with more than you can afford to lose.
              </li>
            </ul>

            {/* ------------------------------------------------------------ BUILD */}
            <div className="mt-20 border-t border-line pt-14">
              <H2 id="x402" kicker="Build with Fuci">
                How paying works
              </H2>
            </div>
            <p className="mt-4 text-ink-2">
              Every Fuci tool is a plain HTTPS endpoint. Call it without paying and it answers <b className="text-ink">402 Payment Required</b> with a
              price. Your agent signs a USDC payment (network <code className="font-mono text-ink">{X402_NETWORK}</code>), retries, and gets the data.
              No account, no API key. If the tool fails, you are not charged.
            </p>
            <Code
              lang="bash"
              title="Try it: see the 402"
              body={`curl -i ${SITE}/api/x402/argus/launches
# HTTP/1.1 402 Payment Required
# { "x402Version": 2, "accepts": [{ "scheme": "exact",
#   "network": "${X402_NETWORK}", "amount": "1000", "asset": "0x3600…0000", ... }] }`}
            />

            <H3 id="mcp">MCP (Claude, Cursor, any MCP client)</H3>
            <p className="mt-3 text-ink-2">
              The quickest way to give an AI assistant Fuci&apos;s tools. It pays from a wallet you choose, with spending caps the model can&apos;t change.
            </p>
            <Code
              lang="json"
              title=".mcp.json · pays from your wallet"
              body={`{
  "mcpServers": {
    "fuci": {
      "command": "npx",
      "args": ["-y", "${SITE}/fuci-mcp.tgz"],
      "env": {
        "FUCI_URL": "${SITE}",
        "FUCI_PRIVATE_KEY": "0x…",
        "FUCI_MAX_CALL": "0.01",
        "FUCI_DAILY": "1"
      }
    }
  }
}`}
            />
            <p className="mt-3 text-sm text-ink-2">
              Use a fresh wallet with a little USDC on Arc and run <code className="font-mono text-ink">fuci_deposit</code> once. Tools:{" "}
              <code className="font-mono text-ink">fuci_balance</code>, <code className="font-mono text-ink">fuci_deposit</code>,{" "}
              <code className="font-mono text-ink">fuci_reputation</code> (free) and every paid tool below.
            </p>
            <Code
              lang="json"
              title="Remote MCP · lists tools and returns what to pay"
              body={`{ "mcpServers": { "fuci": { "type": "http", "url": "${SITE}/api/mcp" } } }`}
            />

            <H3 id="gateway">Pay with Circle Gateway (gas-free, batched)</H3>
            <Code
              lang="ts"
              body={`import { GatewayClient } from "@circle-fin/x402-batching/client";

const gateway = new GatewayClient({
  chain: "${GATEWAY_CHAIN}",
  privateKey: process.env.MY_AGENT_PRIVATE_KEY as \`0x\${string}\`,
});

await gateway.deposit("1.00"); // once: fund your Gateway balance

// Refuse anything over 1 cent per call
gateway.onBeforePaymentCreation(async ({ selectedRequirements }) => {
  if (BigInt(selectedRequirements.amount) > 10_000n) return { abort: true, reason: "too pricey" };
});

const { data } = await gateway.pay("${SITE}/api/x402/fucus/oracle");
console.log(data);`}
            />

            <H3 id="fetch">Pay with @x402/fetch and a Circle wallet</H3>
            <p className="mt-3 text-ink-2">Circle signs the payment, so your code never holds a private key.</p>
            <Code
              lang="ts"
              body={`import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerBatchScheme } from "@circle-fin/x402-batching/client";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circle = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});
const walletId = "<your Circle wallet id>";
const { data } = await circle.getWallet({ id: walletId });

const signer = {
  address: data!.wallet.address as \`0x\${string}\`,
  signTypedData: async (typed: unknown) =>
    (await circle.signTypedData({
      walletId,
      data: JSON.stringify(typed, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    })).data!.signature as \`0x\${string}\`,
};

const client = new x402Client();
registerBatchScheme(client, { signer, networks: ["${X402_NETWORK}"] });
const payFetch = wrapFetchWithPayment(fetch, client);

const res = await payFetch("${SITE}/api/x402/argus/bonding?token=0x…");
console.log(await res.json());`}
            />

            <H3 id="sell">Sell your own tool the same way (Next.js)</H3>
            <Code
              lang="ts"
              title="app/api/my-tool/route.ts"
              body={`import { withX402, x402ResourceServer } from "@x402/next";
import { BatchFacilitatorClient, GatewayEvmScheme } from "@circle-fin/x402-batching/server";

const server = new x402ResourceServer([new BatchFacilitatorClient()])
  .register("${X402_NETWORK}", new GatewayEvmScheme());

export const GET = withX402(
  async () => Response.json({ hello: "tide" }),
  { accepts: { scheme: "exact", price: "$0.001", network: "${X402_NETWORK}", payTo: "0xYou" } },
  server,
);`}
            />

            <H3 id="tools">Paid tools</H3>
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-normal">Tool</th>
                    <th className="px-4 py-3 font-normal">Route</th>
                    <th className="px-4 py-3 text-right font-normal">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {TOOLS.map((t) => (
                    <tr key={t.id} className="border-t border-line/60 align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium">{t.name}</p>
                        <p className="mt-1 text-xs text-ink-2">{t.description}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-2">
                        {t.method} {t.path}
                        {t.input && <span className="block text-muted">{Object.keys(t.input).map((k) => `${k}=…`).join(" ")}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">{t.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-ink-2">
              Machine-readable list: <code className="font-mono text-ink">{SITE}/.well-known/x402</code> and{" "}
              <code className="font-mono text-ink">{SITE}/llms.txt</code>.
            </p>

            <H3 id="api">Free APIs</H3>
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <tbody>
                  {[
                    ["GET /api/token/<address>", "An Argus token: symbol, price in USDC, taxes, progress to bonding, dev"],
                    ["GET /api/erc8004/directory?q=&sort=ranked|newest|rated&x402=1", "Every agent on Arc, searchable and ranked"],
                    ["GET /api/erc8004/agent/<agentId>", "Reputation and validations of any ERC-8004 agent"],
                    ["GET /api/agent/<id>/card", "A Fuci agent's ERC-8004 registration file"],
                    ["GET · POST /api/agent/<id>/a2a", "A2A (Agent2Agent): GET the agent card, POST JSON-RPC message/send to talk to the agent (free within a daily budget)"],
                    ["GET /.well-known/agent-card.json", "The house agent's registration file"],
                    ["GET /api/runs/<hash>", "A stored run; the hash is its ERC-8004 validation requestHash"],
                    ["GET /api/runs/<hash>/validation", "The re-check report for that run (0–100)"],
                    ["GET /api/stats", "Live network numbers"],
                  ].map(([route, what]) => (
                    <tr key={route} className="border-t border-line/60 first:border-t-0">
                      <td className="px-4 py-3 font-mono text-xs">{route}</td>
                      <td className="px-4 py-3 text-ink-2">{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <H3 id="contracts">Contracts</H3>
            <p className="mt-3 text-ink-2">Everything runs on {ARC_CHAIN.name} (chain {ARC_CHAIN.id}).</p>
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <tbody>
                  {contracts.map(([name, a, role]) => (
                    <tr key={name} className="border-t border-line/60 align-top first:border-t-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">{name}</p>
                        <p className="mt-0.5 text-xs text-muted">{role}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Addr a={a} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-ink-2">
              Directory ranking: x402 support (40 points), registration-file completeness (50) and on-chain trust (10), plus a bonus for agents made
              on Fuci.
            </p>
          </article>
        </div>
      </div>
    </main>
  );
}
