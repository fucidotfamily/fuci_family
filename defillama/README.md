# Listing Fuci on DefiLlama

Category: **AI Agents** · Chain: **Arc** · TVL: none (fees-only listing)

## 1. The factory (done)
`FuciAgentFactory` is live on Arc at [`0x77fa3ae9604539fee8f199adc02f12f318c2bfbc`](https://explorer.arc.io/address/0x77fa3ae9604539fee8f199adc02f12f318c2bfbc) (deployed 2026-09-24, block 22474356). Owner: `0x900c41EDa7013b1E1c1Ad3AF3c47188A04A2160A`. Treasury: the Fuci Safe `0x039a30f17a7d71582B648bE4c1dF9aB3a08a5F75` (Safe v1.5.0 multisig). Each agent created on-chain pays **1 USDC** to the treasury and emits:

```
AgentCreated(uint256 indexed agentId, address indexed owner, uint256 feePaid, string name, string agentURI)
```

The agentId is the agent's ERC-8004 id on Arc, and the identity NFT goes to the creator.

Optional but recommended: verify the contract on the Arc explorer (source: `contracts/FuciAgentFactory.sol`, solc 0.8.28, optimizer 200 runs, EVM cancun).

## 2. The adapter (done)
`defillama/fuci.ts` already points at the factory, with `start` set to 2026-09-24.

## 3. Open the PR
Fork https://github.com/DefiLlama/dimension-adapters, add the file as `fees/fuci.ts`, test with:

```
npm i && npm test fees fuci
```

Then open a PR (enable "Allow edits by maintainers") and fill the template:

- **Name:** Fuci
- **Twitter:** https://x.com/fucidotfamily
- **Website:** https://www.fuci.family
- **Logo:** a square PNG of the Fuci mark
- **Current TVL:** none (fees only)
- **Treasury addresses:** 0x039a30f17a7d71582B648bE4c1dF9aB3a08a5F75 (Arc, Safe multisig)
- **Chain:** Arc
- **Short description:** Spawn AI agents on Arc that pay their own way in USDC over x402. Creating an agent on-chain costs 1 USDC.
- **Category:** AI Agents
- **Github:** 7abar/fuci
- **Methodology:** fees are the USDC creation fees from AgentCreated events; all go to the treasury.

Answers the reviewers usually ask: 0-fee days are normal (no agents created that day); the fee has been 1 USDC since deployment unless changed by `setFee` (emits `FeeChanged`); the adapter reads `feePaid` from each event, so any fee change is tracked automatically.
