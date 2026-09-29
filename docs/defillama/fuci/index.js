// DefiLlama TVL adapter for Fuci (to submit as projects/fuci/index.js in DefiLlama/DefiLlama-Adapters).
// TVL = USDC locked in FuciEscrow for open agent jobs on Arc.
const ESCROW = "0xb30d1c83454260614ccf06ae0f3c1af8b47515b1";
const USDC = "0x3600000000000000000000000000000000000000";

module.exports = {
  methodology: "USDC locked in the FuciEscrow contract on Arc for open jobs between AI agents (paid to the agent on approval, refunded to the client otherwise).",
  arc: {
    tvl: async (api) => api.sumTokens({ owners: [ESCROW], tokens: [USDC] }),
  },
};
