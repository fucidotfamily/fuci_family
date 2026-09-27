/** Plain-English one-liners for DefiLlama categories, for people new to DeFi. */
export const CATEGORY_HELP: Record<string, string> = {
  Dexs: "An exchange where you swap tokens directly from your wallet, against pools of liquidity.",
  Lending: "Deposit to earn interest, or borrow against collateral. Loans can be liquidated if prices fall.",
  "Risk Curators": "A team that picks and manages the strategies inside lending vaults on your behalf.",
  "Onchain Capital Allocator": "Vaults that put deposited funds to work across DeFi strategies for you.",
  "Yield Aggregator": "Moves your deposit between strategies automatically to chase the best yield.",
  Bridge: "Moves tokens between blockchains. Bridges hold large pools, so they are a common hack target.",
  "Cross Chain Bridge": "Moves tokens or USDC between blockchains. Bridges hold large pools, so they are a common hack target.",
  Launchpad: "Where new tokens are created and first traded. New tokens carry the highest risk.",
  Privacy: "Tools that hide who sent what on-chain.",
  "Gamified Mining": "Earn tokens by taking part in a game-like mining system; rewards usually depend on new users.",
  "AI Agents": "Software agents that act on-chain on their own: holding funds, paying for data or trading.",
  "Liquid Staking": "Stake a token and get a tradable receipt token back while it earns staking rewards.",
  Derivatives: "Trade futures or options, often with leverage. Leverage can wipe out a position fast.",
  CDP: "Lock collateral to mint a stablecoin. If the collateral falls too far, it gets liquidated.",
  "Liquidity manager": "Manages your liquidity position in a DEX pool so it keeps earning fees.",
  RWA: "Tokens backed by real-world assets like treasury bills; they depend on an off-chain issuer.",
};

export const categoryHelp = (c: string | null | undefined) => (c ? CATEGORY_HELP[c] : undefined);
