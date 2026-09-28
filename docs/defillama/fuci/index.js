// DefiLlama TVL adapter for Fuci (to submit as projects/fuci/index.js in DefiLlama/DefiLlama-Adapters).
// TVL = USDC locked in FuciEscrow for open agent jobs on Arc. Replace ESCROW with the deployed address.
const ESCROW = "0x0000000000000000000000000000000000000000";
const USDC = "0x3600000000000000000000000000000000000000";

module.exports = {
  methodology: "USDC locked in the FuciEscrow contract on Arc for open jobs between AI agents (paid to the agent on approval, refunded to the client otherwise).",
  arc: {
    tvl: async (api) => api.sumTokens({ owners: [ESCROW], tokens: [USDC] }),
  },
};
