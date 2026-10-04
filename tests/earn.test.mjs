import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

// Execute the real module, replacing only network, signing and persistence boundaries.
// No private keys, Redis instance or blockchain connection are used by these tests.
const source = await readFile(new URL("../lib/earn.ts", import.meta.url), "utf8");
const VAULT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TREASURY = "0xcccccccccccccccccccccccccccccccccccccccc";
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const MINE = "earn:mine:agent";
const PRINCIPAL = `earn:principal:agent:${VAULT}`;
const listedVault = {
  vaultAddress: VAULT, name: "Arc lending vault", protocol: "fixture", asset: "USDC",
  currentApy: 0.05, vaultFee: 0, status: "active", circleGuarded: false,
  totalDeposits: "2000", liquidity: "2000",
};

async function fixture({ vaults = [listedVault], tracked = true, asset = "USDC", balance = "100", principal = 100, discoveryError, withdrawalError } = {}) {
  const store = new Map([[MINE, tracked ? [VAULT] : []], [PRINCIPAL, principal]]);
  const calls = { discovery: 0, signers: 0, withdraw: [], deposits: [], fees: [], history: [] };
  class EarnKit {
    async exploreVaults() {
      calls.discovery++;
      if (discoveryError) throw discoveryError;
      return { vaults };
    }
    async getSupportedChains() { return [{ id: 5042, name: "Arc" }]; }
    async getPosition({ from, vaultAddress }) {
      assert.equal(from.chain, "Arc");
      assert.equal(vaultAddress, VAULT);
      return {
        wallet: WALLET, chain: "Arc", vaultAddress: VAULT, vaultName: "Held Arc vault",
        asset, currentBalance: balance, currentApy: 0.05, shares: balance,
        pnl: { status: "available", principalDeposited: String(principal), totalYieldEarned: "0" },
        accruedRewards: [],
      };
    }
    async withdraw({ from, vaultAddress, amount }) {
      assert.equal(from.chain, "Arc");
      assert.equal(vaultAddress, VAULT);
      calls.withdraw.push({ vaultAddress, amount });
      if (withdrawalError) throw withdrawalError;
      return { amount, txHash: "0xwithdraw", explorerUrl: "https://example.invalid/withdraw" };
    }
    async deposit({ amount }) {
      calls.deposits.push(amount);
      return { txHash: "0xdeposit" };
    }
  }
  const deps = {
    "@circle-fin/earn-kit": { EarnKit },
    "@circle-fin/adapter-viem-v2": { ViemAdapter: class {} },
    viem: { erc20Abi: [], formatUnits: (n) => String(Number(n) / 1e6), parseUnits: (s) => BigInt(s.replace(".", "")) },
    "viem/chains": { arc: { id: 5042, name: "Arc" } },
    "./agentWallets": { agentAccount: async () => { calls.signers++; return { address: WALLET }; } },
    "./chain": {
      readClient: () => ({ waitForTransactionReceipt: async () => ({ status: "success" }) }),
      walletClientFor: () => ({ writeContract: async (args) => { calls.fees.push(args); return "0xfee"; } }),
    },
    "./config": { ARC_NETWORK: "mainnet", ARC_USDC: USDC, FUCI_TREASURY: TREASURY },
    "./store": {
      kvGet: async (key) => store.get(key) ?? null,
      kvSet: async (key, value) => { store.set(key, value); },
      pushHistory: async (_id, event) => { calls.history.push(event); },
    },
  };
  const context = vm.createContext({ process: { env: {} } });
  const mod = new vm.SourceTextModule(stripTypeScriptTypes(source), { context });
  await mod.link((specifier) => {
    const exports = deps[specifier];
    assert.ok(exports, `Unexpected external dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return { earn: mod.namespace, store, calls };
}

test("withdraws an existing position from a listed vault", async () => {
  const { earn, store } = await fixture();
  const result = await earn.earnWithdraw("agent", VAULT, "all");
  assert.equal(result.amount, 100);
  assert.equal(result.asset, "USDC");
  assert.equal(store.get(PRINCIPAL), 0);
  assert.equal(store.get(MINE).length, 0);
});

for (const [name, vaults] of [
  ["TVL falls below the deposit threshold", [{ ...listedVault, totalDeposits: "900" }]],
  ["vault becomes inactive", [{ ...listedVault, status: "inactive" }]],
  ["vault is omitted from the discovery page", []],
]) {
  test(`withdraws a held position when ${name}`, async () => {
    const { earn, store, calls } = await fixture({ vaults });
    const result = await earn.earnWithdraw("agent", VAULT.toUpperCase().replace("0X", "0x"), "all");
    assert.equal(result.amount, 100);
    assert.equal(calls.withdraw[0].amount, "100.000000");
    assert.equal(store.get(PRINCIPAL), 0);
    assert.equal(store.get(MINE).length, 0);
  });
}

test("withdraws a held position without calling unavailable discovery", async () => {
  const { earn, calls } = await fixture({ discoveryError: new Error("Discovery is unavailable") });
  assert.equal((await earn.earnWithdraw("agent", VAULT, "all")).amount, 100);
  assert.equal(calls.discovery, 0);
});

test("partial EURC withdrawal uses position metadata for fees and keeps the remaining principal", async () => {
  const { earn, store, calls } = await fixture({ vaults: [], asset: "EURC", balance: "120", principal: 100 });
  const result = await earn.earnWithdraw("agent", VAULT, 60);
  assert.equal(result.amount, 60);
  assert.equal(result.asset, "EURC");
  assert.equal(result.fee, 1);
  assert.equal(calls.fees[0].address, EURC);
  assert.equal(calls.fees[0].args[0], TREASURY);
  assert.equal(calls.fees[0].args[1], 1000000n);
  assert.equal(store.get(PRINCIPAL), 50);
  assert.equal(store.get(MINE)[0], VAULT);
  assert.match(calls.history[0].label, /EURC out of Held Arc vault/);
});

test("failed redemption preserves the tracked position and principal", async () => {
  const { earn, store, calls } = await fixture({ vaults: [], withdrawalError: new Error("Redemption reverted") });
  await assert.rejects(earn.earnWithdraw("agent", VAULT, "all"), /Redemption reverted/);
  assert.equal(store.get(PRINCIPAL), 100);
  assert.equal(store.get(MINE)[0], VAULT);
  assert.equal(calls.history.length, 0);
});

test("does not sign a withdrawal for an untracked, unlisted vault", async () => {
  const { earn, calls } = await fixture({ tracked: false, vaults: [] });
  await assert.rejects(earn.earnWithdraw("agent", VAULT, "all"), /isn't listed/);
  assert.equal(calls.signers, 0);
  assert.equal(calls.withdraw.length, 0);
});

test("preserves withdrawal support for untracked positions in listed vaults", async () => {
  const { earn } = await fixture({ tracked: false });
  assert.equal((await earn.earnWithdraw("agent", VAULT, "all")).amount, 100);
});

test("rejects unsupported position assets before redemption or fee transfer", async () => {
  const { earn, calls, store } = await fixture({ asset: "OTHER" });
  await assert.rejects(earn.earnWithdraw("agent", VAULT, "all"), /Unsupported Earn asset/);
  assert.equal(calls.withdraw.length, 0);
  assert.equal(calls.fees.length, 0);
  assert.equal(store.get(PRINCIPAL), 100);
});

test("rejects an empty held position without forgetting its tracking record", async () => {
  const { earn, calls, store } = await fixture({ balance: "0" });
  await assert.rejects(earn.earnWithdraw("agent", VAULT, "all"), /Nothing in this vault/);
  assert.equal(calls.withdraw.length, 0);
  assert.equal(store.get(MINE)[0], VAULT);
});

for (const [name, vaults, expected] of [
  ["low TVL", [{ ...listedVault, totalDeposits: "900" }], /isn't listed/],
  ["inactive", [{ ...listedVault, status: "inactive" }], /isn't listed/],
  ["absent", [], /isn't listed/],
  ["low liquidity", [{ ...listedVault, status: "low_liquidity" }], /low on liquidity/],
]) {
  test(`still refuses a new deposit into a ${name} vault`, async () => {
    const { earn, calls } = await fixture({ vaults });
    await assert.rejects(earn.earnDeposit("agent", VAULT, 10), expected);
    assert.equal(calls.signers, 0);
    assert.equal(calls.deposits.length, 0);
  });
}
