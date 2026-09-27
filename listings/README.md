# Fuci listing kit

Ready-to-paste text for free listings. Facts here are checked against Arc Mainnet and the live site.

| Item | Value |
| --- | --- |
| Website | https://www.fuci.family |
| X | https://x.com/fucidotfamily |
| GitHub | https://github.com/fucidotfamily/fuci_family |
| Logo (200×200, transparent PNG) | https://www.fuci.family/brand/fuci-logo-200.png |
| Banner | https://www.fuci.family/brand/fuci-banner.png |
| $FUCI (Arc, 18 decimals) | `0xe66d5169c5d235209d74e976e594060c44c64420` |
| FuciAgentFactory (verified) | `0x77Fa3Ae9604539Fee8F199adC02f12f318c2bFbc` |
| Treasury (Safe multisig) | `0x039a30f17a7d71582B648bE4c1dF9aB3a08a5F75` |
| Dev lock (until Sep 25, 2027) | `0xFEe1d11d4501D66D8eA1024dc198ee5663c2bf6B` |
| Supply APIs | https://www.fuci.family/api/supply/total · https://www.fuci.family/api/supply/circulating |

---

## 1. Arc ecosystem page (arc.io/ecosystem)

Open https://www.arc.io/ecosystem and use the submission form on that page (scroll to the bottom). Pick **Payments** as the category (or **Developer Tools** if only one fits and Payments is taken).

**Project name:** Fuci

**One-line description** (short field):
> AI agents on Arc that pay for data in USDC over x402, with ERC-8004 identities and a live market of paid APIs.

**Description** (long field):
> Fuci lets anyone create an AI agent on Arc for 1 USDC. Each agent gets its own USDC wallet and an ERC-8004 identity on Arc Mainnet, created through the verified FuciAgentFactory contract (0x77Fa3Ae9604539Fee8F199adC02f12f318c2bFbc). Agents pay per call in USDC over x402, settled through Circle Gateway on Arc, so they need no API keys or subscriptions. Fuci sells on-chain data about Argus launches as x402 endpoints, lets owners run trading autopilots within daily limits, and runs Fuci Market, a live directory of every paid x402 API that accepts USDC on Arc. New users can fund agents with a card or bank transfer through the embedded Arc Onramp Kit. The code is open source (MIT) and usage, fees and treasury are public at fuci.family/stats.

**Links:** website https://www.fuci.family · X https://x.com/fucidotfamily · GitHub https://github.com/fucidotfamily/fuci_family · Docs https://www.fuci.family/docs

**Logo:** upload `public/brand/fuci-logo-200.png` (or the 512 px `public/brand/fuci-logo-512.png` if they ask for larger).

**Arc tech used** (if there is a field for it): USDC as gas, Circle Gateway (x402 nanopayments), ERC-8004 registries on Arc, Onramp Kit, Uniswap v4 via Argus.

---

## 2. x402 directories (replaces the old x402.org ecosystem page)

The x402 repo moved to https://github.com/x402-foundation/x402 and no longer has an ecosystem page or `partners-data` folder, so there is nothing to fork or PR. Its README now points to community directories. Submit Fuci to each (all free):

| Directory | How to submit |
| --- | --- |
| x402scan.com | https://www.x402scan.com/resources/register — register each endpoint URL below |
| x402-list.com | https://x402-list.com/submit |
| pay.sh | "List your API" on https://pay.sh |
| agentic.market / app.ampersend.ai/discover | no public form found; they index x402 resources automatically. Share the manifest URL with them on X or the x402 Slack (http://slack.x402.org/) |

**Endpoints to register** (all answer 402 with an Arc USDC price):
```
https://www.fuci.family/api/x402/argus/launches
https://www.fuci.family/api/x402/argus/bonding
https://www.fuci.family/api/x402/fucus/oracle
https://www.fuci.family/api/agent/run
```
**Discovery manifest:** `https://www.fuci.family/.well-known/x402` · **MCP:** `https://www.fuci.family/api/mcp` · **Docs:** `https://www.fuci.family/docs`

**Name:** Fuci · **Network:** Arc Mainnet (eip155:5042), USDC via Circle Gateway

**Description:**
> AI agents on Arc that pay their own way. Fuci sells on-chain data (Argus launches, bonding, tide oracle) as x402 endpoints paid in USDC on Arc via Circle Gateway, and runs Fuci Market: a live directory of every x402 API that accepts USDC on Arc, searchable over HTTP and MCP.

Also post in the x402 Slack (#showcase or similar) with the link to https://www.fuci.family/market.

(The files in `listings/x402-ecosystem/` were for the old ecosystem PR; `metadata.json` still has a reusable description and `public/logos/fuci.png` a 200×200 logo.)

---

## 3. Arc explorer token info (explorer.arc.io)

The Arc explorer runs Blockscout, which lets a token's owner add a logo, website and socials for free.

1. Go to https://explorer.arc.io and **Sign in** (top right).
2. Open **Account → Verified addresses → Add address**. Add the **dev wallet that created $FUCI** (`0x900c41eda7013b1e1c1ad3af3c47188a04a2160a`) and sign the message with that wallet. This proves you own the token.
3. Then open the $FUCI token page https://explorer.arc.io/token/0xe66d5169c5d235209d74e976e594060c44c64420 → **Update token info** (or **Account → Token info → Add**), and fill in:

| Field | Value |
| --- | --- |
| Project name | Fuci |
| Project website | https://www.fuci.family |
| Official email | your project email |
| Icon URL | https://www.fuci.family/brand/fuci-logo-200.png |
| Project description | AI agents on Arc that pay for data in USDC over x402. FUCI is the project token: 1% buy/sell tax, 90% of the creator share paid to holders in USDC. |
| Project sector | Payments / AI |
| X (Twitter) | https://x.com/fucidotfamily |
| GitHub | https://github.com/fucidotfamily/fuci_family |
| DefiLlama | https://defillama.com/protocol/fuci |
| CoinGecko / CMC | add after the listings are approved |

If the explorer doesn't offer "Update token info", ask in Arc's builder channels (Discord/Telegram) where token metadata requests go.

---

## 4. MCP directories (AI builders using Claude, Cursor and other MCP clients)

Fuci's MCP server is live at `https://www.fuci.family/api/mcp` (Streamable HTTP, no login). It has 6 tools: `market_search` and `fuci_reputation` (free), plus `argus_launches`, `argus_bonding`, `fucus_oracle` and `fuci_agent` (paid per call in USDC over x402).

**Short description** (100 characters max):
> AI agents on Arc: search paid x402 APIs, ERC-8004 reputation, Argus launch data paid in USDC.

**Long description:**
> Fuci's MCP server gives AI agents live data from Arc Mainnet. Search Fuci Market, a directory of every paid x402 API that accepts USDC on Arc; read any agent's ERC-8004 identity and reputation; and buy Argus launch, bonding and market-mood data per call in USDC over x402. Free tools need no key; paid tools return the x402 payment details.

### a. Official MCP Registry (registry.modelcontextprotocol.io)

Other directories read from this one, so do it first. The file is ready: `listings/mcp/server.json` (checked against the registry's schema).

1. Install `mcp-publisher`. On Windows, in PowerShell:
   ```powershell
   $arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }; Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"; tar xf mcp-publisher.tar.gz mcp-publisher.exe; rm mcp-publisher.tar.gz
   ```
2. Put `server.json` in the same folder as `mcp-publisher.exe`.
3. Log in with GitHub: `.\mcp-publisher.exe login github`. Open the link, enter the code, and approve.
   Published under the domain name `family.fuci.www/fuci` (the registry does not follow the fuci.family → www redirect, so the proof uses www.fuci.family), proven by `public/.well-known/mcp-registry-auth` (public key only). To update, generate a new key pair, replace that file with the new public key, then run `mcp-publisher login http --domain www.fuci.family --private-key <hex>` and `mcp-publisher publish`.
4. Publish: `.\mcp-publisher.exe publish`
5. Check it: https://registry.modelcontextprotocol.io/v0/servers?search=fuci

To update later, raise `version` in `server.json` and publish again.

### b. Smithery (smithery.ai)

Sign in with GitHub → **Publish a server** / **Add server** → choose the option for an existing remote (hosted) server → URL `https://www.fuci.family/api/mcp`. Name it **Fuci**, and paste the short description and the logo `https://www.fuci.family/brand/fuci-logo-200.png`.

### c. Glama (glama.ai/mcp/servers)

Sign in → **Add Server**. Use the GitHub repo `https://github.com/fucidotfamily/fuci_family` and the remote URL above. Glama also imports from the official registry, so after step a it may appear there automatically.

### d. mcp.so

Open https://mcp.so/submit. Type: **Server**. Name: **Fuci**. URL: `https://www.fuci.family/api/mcp`. Paste the long description.

### Try it yourself (for screenshots and posts)

In Claude: **Settings → Connectors → Add custom connector**, then paste `https://www.fuci.family/api/mcp`. Ask: *"Search Fuci Market for web search APIs"*.
