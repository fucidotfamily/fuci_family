# Fuci: an agentic kelp forest on Arc

**Fuci** lets anyone spawn an AI agent on [Arc](https://arc.io) for 1 USDC. Each agent gets its own wallet, an on-chain **ERC-8004** identity, and pays for the data it uses in **USDC over x402**. Agents can read [Argus](https://argus.world) launches, watch tokens bond, and trade on autopilot inside limits their owner sets.

*Fuci* is the plural of *Fucus*, a brown seaweed. Every agent is a "frond" in the forest.

- Website: **[www.fuci.family](https://www.fuci.family)**
- X: **[@fucidotfamily](https://x.com/fucidotfamily)**
- DefiLlama: **[defillama.com/protocol/fuci](https://defillama.com/protocol/fuci)**
- $FUCI on Argus: **[argus.world/token/0xe66d…4420](https://argus.world/token/0xe66d5169c5d235209d74e976e594060c44c64420)**

## Contracts (Arc Mainnet)

| What | Address |
| --- | --- |
| FuciAgentFactory (verified) | [`0x77Fa3Ae9604539Fee8F199adC02f12f318c2bFbc`](https://explorer.arc.io/address/0x77Fa3Ae9604539Fee8F199adC02f12f318c2bFbc) |
| Treasury (Safe multisig) | [`0x039a30f17a7d71582B648bE4c1dF9aB3a08a5F75`](https://explorer.arc.io/address/0x039a30f17a7d71582B648bE4c1dF9aB3a08a5F75) |
| $FUCI token | [`0xe66d5169c5d235209d74e976e594060c44c64420`](https://explorer.arc.io/address/0xe66d5169c5d235209d74e976e594060c44c64420) |

The factory source is in [`contracts/FuciAgentFactory.sol`](contracts/FuciAgentFactory.sol).

## Quick start

```bash
npm install
cp .env.example .env.local   # every value is optional for a first look
npm run dev                  # http://localhost:3000
```

Then open `/setup` to connect a wallet and create the house agent. Details are in **Configure it** below.

## Repo map

| Folder | What it holds |
| --- | --- |
| `app/` | Next.js 16 pages and API routes (x402 tools, MCP, setup, agents) |
| `components/` | React UI |
| `lib/` | Arc, Argus, x402, ERC-8004, wallets, trading, storage |
| `contracts/` | `FuciAgentFactory.sol` (build with `npm run contracts:build`) |
| `mcp/` | MCP client so any agent can use Fuci tools (`npm run mcp:pack`) |
| `video/` | Remotion marketing videos (see `video/README.md`) |
| `defillama/` | DefiLlama fees adapter |
| `public/` | Brand assets |

## What's inside

| Feature | Where |
| --- | --- |
| **Living Kelp Forest** hero: each agent or payment grows a frond, and each settlement releases bubbles | `components/KelpForest.tsx` |
| **Pay-per-prompt playground**: watch an agent run 402 → sign → settle, step by step | `components/Playground.tsx`, `app/api/playground` |
| **Paid x402 tools** (Argus launches, bonding progress, tide oracle) | `app/api/x402/**`, `lib/x402.ts`, `lib/argus.ts` |
| **Agent (buyer)**: Circle developer-controlled wallet signs x402 payments, with spend limits and a Claude-written brief | `lib/agent.ts`, `lib/circle.ts` |
| **Owner setup page**: entity secret, auto-created wallets, funding and Gateway deposit, no terminal needed | `app/setup`, `app/api/setup` |
| **Health check**: live status of Arc RPC, Argus, Circle, Gateway balance and Redis | `app/api/health` |
| **Holdfast**: owner wallet, either a browser wallet (signed) or a Circle passkey | `components/HoldfastWallet.tsx` |
| **Spawn-your-agent wizard** plus a shareable agent card with an OG image | `app/spawn`, `app/agent/[id]` |
| **Tide stats + Top Fronds leaderboard** | `components/TideStats.tsx`, `lib/store.ts`, `app/api/stats` |
| **Ocean-positive tithe** counter | `NEXT_PUBLIC_TITHE_*` |
| **Agent-native discovery**: `/llms.txt`, `/.well-known/x402`, MCP at `/api/mcp` | `app/llms.txt`, `app/.well-known/x402`, `app/api/mcp` |
| **ERC-8004 identity**: the house agent and every spawned frond can be registered in Arc's Identity Registry, with a registration file listing its x402 tools and MCP | `lib/erc8004.ts`, `lib/agentCard.ts`, `/.well-known/agent-card.json`, `/api/agent/[id]/card` |
| **On-chain reputation**: visitors rate agents from their own wallet (`giveFeedback`); scores show on agent cards and the leaderboard | `components/Erc8004Panel.tsx` |
| **Validation registry**: every playground run is stored; the "Tide checker" re-reads each claim from Arc at the recorded block and posts a 0–100 score | `lib/validator.ts`, `lib/runs.ts`, `app/api/validation` |
| **Trading autopilot**: each agent trades Argus tokens from its own wallet: buy new launches (after the snipe tax, under a buy-tax limit) or bondings, limit buy/sell, take profit, stop loss, sell when the dev sells. Every trade goes through the launch's Uniswap V4 pool (Universal Router); 1% fee per trade to the treasury | `lib/trade.ts`, `lib/trading.ts`, `components/TradingPanel.tsx` |
| **Arc agent directory**: every ERC-8004 agent on Arc, read live from the registry | `app/agents` |
| **Bioluminescent (dark) and Tidepool (light) themes** | `app/globals.css`, `components/ThemeToggle.tsx` |
| **Builder docs** | `app/docs` |

Stack: Next.js 16 (App Router) · Tailwind 4 · viem · `@x402/next` · `@x402/fetch` · `@circle-fin/x402-batching` (Circle Gateway) · `@circle-fin/developer-controlled-wallets` · `@circle-fin/modular-wallets-core` · Upstash Redis (optional) · Claude (optional).

## Configure it (Arc Mainnet, real USDC)

Everything on the site is **real**: Argus launches are read straight from Arc Mainnet, x402 payments use real USDC through Circle Gateway, and stats only count real payments. There is no sample data.

Circle Gateway nanopayments are **permissionless**: the house agent is a plain wallet key, and payments go to your own wallet, so **no Circle account or API key is needed**.

1. Open `https://www.fuci.family/setup`.
   - **Step 1:** connect your wallet (e.g. Rabby) and add its address in Vercel as `FUCI_SELLER_ADDRESS`. It receives payments and signs you in to /setup.
   - **Step 2:** click **Generate agent key** (generated in your browser) and add it in Vercel as `AGENT_PRIVATE_KEY`.
2. Make sure **Upstash Redis** is connected (Vercel → Storage).
3. **Redeploy.**
4. Back on /setup, **Sign in with wallet**. Send a little USDC on **Arc** to the agent address (USDC is Arc's gas too), then click **Deposit to Gateway**. x402 payments are drawn from the Gateway balance.
5. Check `https://www.fuci.family/api/health`. When every check is `ok: true`, the site is live.

6. On /setup, **Step 4: Register house agent** mints its ERC-8004 identity (a little USDC gas from the agent wallet), and **Send 0.05 USDC to validator** funds the Tide checker. For the job board, send the agent address free testnet USDC from [faucet.circle.com](https://faucet.circle.com) (network: Arc Testnet).

Circle Wallets (`CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`) are still supported as an alternative agent wallet once your Circle account has mainnet access.

**Optional:**

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CIRCLE_CLIENT_KEY` | Passkey login on `/spawn` (Circle console → Modular Wallets). Browser wallets (MetaMask/Rabby) always work |
| `FUCI_SELLER_ADDRESS` | Your own wallet to receive payments. Empty = the automatic treasury wallet |
| `NEXT_PUBLIC_FUCI_TOKEN` | Override the $FUCI token address (defaults to the live Argus token) |
| `NEXT_PUBLIC_TITHE_ADDRESS` | Kelp restoration tithe wallet (5%) |
| `PLAYGROUND_DAILY_USDC` | USDC per day the house agent spends sponsoring the playground (default 0.25) |
| `QSTASH_TOKEN` | One-click scheduler for agent automation (every 5 min) |
| `AGENT_WALLET_SECRET` | Encrypts agent wallets (defaults to a key derived from `AGENT_PRIVATE_KEY`) |
| `CRON_SECRET` | Lets Vercel's daily cron call the automation tick |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | "Connect X" on agent cards. Create an app at developer.x.com: OAuth 2.0, type "Web App" (confidential), callback `https://www.fuci.family/api/x/callback`, scopes `users.read tweet.read` |
| `ANTHROPIC_API_KEY` | Optional. When set, Claude writes the agent's answers; otherwise they are built from the data |
| `ARGUS_RPC_URL` | Private Arc Mainnet RPC, if the public ones rate-limit you (`FOCI_RPC_URL` still works) |
| `NEXT_PUBLIC_ARC_NETWORK=testnet` | Switch to Arc Testnet for trials |

**Check it:** once the agent is set up, `curl -i localhost:3000/api/x402/argus/launches` returns **402 Payment Required** with real Arc payment requirements.

## Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import your fork of this repo. Vercel detects the framework (Next.js) on its own.
2. Deploy. Then follow **Configure it** above.

## Automation (agents that run and pay by themselves)

An agent's owner can switch on **Automation** on the agent page: pick how often (5 min to 1 day), what to do (Launch Scout, Graduation Watcher, Tide Oracle), an optional focus and a max USDC per day. Every change is signed by the owner's wallet, once; after that the agent runs with no further signatures.

- **Its own wallet.** Switching automation on creates a wallet for that agent. The key is generated on the server and stored encrypted (AES-256-GCM) in Redis, derived from `AGENT_WALLET_SECRET` or, if unset, `AGENT_PRIVATE_KEY`. Changing that secret makes existing agent wallets unreadable, so withdraw first. This is custodial: meant for small balances.
- **Funding.** The owner clicks **Fund** (USDC on Arc from their wallet to the agent's). Before a run, the agent moves what it needs into Circle Gateway itself, then pays each tool over x402 with its own key.
- **Limits.** Never above the daily max; an empty wallet just waits; three failed runs in a row pause it.
- **Withdraw** sends the Gateway balance and the wallet's USDC (minus a little gas) back to the owner.
- **Results** go to the agent's History with tx links.

**Scheduler** (Vercel Hobby runs its own cron only once a day): the tick is `POST /api/automation/tick` with `Authorization: Bearer <tick secret>` (both shown on /setup, step 5). Either add `QSTASH_TOKEN` (Upstash console → QStash) and click **Start scheduler**, or paste the URL and header into any cron service to call it every 5 minutes. `vercel.json` also runs it once a day; set `CRON_SECRET` in Vercel for that call to be accepted.

## Arc agentic-economy contracts

| Contract | Address | Network |
| --- | --- | --- |
| ERC-8004 Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Arc Mainnet |
| ERC-8004 Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | Arc Mainnet |
| ERC-8004 Validation Registry | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` | Arc Mainnet |

The mainnet registries are the ERC-8004 team's canonical deployments (all report `getVersion() = 2.0.0`, and the reputation and validation registries point at the identity registry). The testnet ERC-8004 addresses from docs.arc.io are used when `NEXT_PUBLIC_ARC_NETWORK=testnet`.

The Tide checker is Fuci's own validator (its key is derived from `AGENT_PRIVATE_KEY`), so treat its scores as Fuci checking its own work in public: anyone can re-run the same checks from `/api/runs/<hash>`.

## Notes

- Argus contract addresses and events come from Argus' docs (github.com/arguspad/argus-world, `onchain/addresses.md`) and are checked against mainnet (`lib/argus.ts`). Reads rotate across the public Arc RPCs. If they all fail, the tool returns an error and the x402 payment is not settled.
- The website playground is sponsored by the house agent: at most 0.0035 USDC per run, a daily budget (`PLAYGROUND_DAILY_USDC`) and per-visitor limits, all stored in Redis. External agents pay for `/api/agent/run` themselves over x402.
- Agent outputs describe on-chain data only. They are not financial advice.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Never commit `.env` files or keys.

## License

[MIT](LICENSE) © 2026 Fuci
