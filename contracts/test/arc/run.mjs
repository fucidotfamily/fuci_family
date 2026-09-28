// Runs contracts/test/arc/ArcHarness.sol on Arc mainnet inside a single eth_call: the harness gets a
// temporary USDC balance (state override), deploys FuciEscrow and settles real jobs against Arc's
// native USDC. Nothing is broadcast and no real funds move.
//   cd contracts && forge build && node test/arc/run.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, decodeFunctionResult, encodeFunctionData, http, parseEther } from "viem";
import { arc } from "viem/chains";

const art = JSON.parse(readFileSync(new URL("../../out/ArcHarness.sol/ArcHarness.json", import.meta.url), "utf8"));
const H = "0x00000000000000000000000000000000fac1e5c0";
const c = createPublicClient({ chain: arc, transport: http(process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io", { timeout: 30_000 }) });
const { data } = await c.call({
  account: "0x000000000000000000000000000000000000dEaD",
  to: H,
  data: encodeFunctionData({ abi: art.abi, functionName: "run" }),
  gas: 30_000_000n,
  stateOverride: [{ address: H, code: art.deployedBytecode.object, balance: parseEther("100") }],
});
const out = decodeFunctionResult({ abi: art.abi, functionName: "run", data });
const f = (x) => (Number(x) / 1e6).toFixed(6);
console.log(`OK on Arc mainnet at block ${out[7]}`);
console.log(`client ${f(out[0])} -> ${f(out[1])} | provider ${f(out[2])} | treasury ${f(out[3])} | escrow ${f(out[4])} (totalLocked ${f(out[5])}) | jobs ${out[6]}`);
