import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Evaluate the checked-in route, getPositions and sendToken without rewriting their source.
// Only storage and external authentication/signing/RPC boundaries are replaced. No network or keys.
const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const A = `0x${"1".repeat(40)}`, B = `0x${"2".repeat(40)}`;
const wallet = `0x${"3".repeat(40)}`, owner = `0x${"4".repeat(40)}`;
const hash = `0x${"a".repeat(64)}`;
const copy = (value) => JSON.parse(JSON.stringify(value));
const position = (token) => ({
  token, symbol: token === A ? "ALPHA" : "BETA", amount: "1000000000000000000",
  decimals: 18, costUsdc: 12.5, openedAt: 1_700_000_000_000, devBalance: "2500000000000000000",
  fired: ["take-profit-1"], lastPrice: 12.5, peak: 15.75,
});
function load(file, dependencies) {
  const compiledModule = { exports: {} };
  const filename = fileURLToPath(new URL(file, root));
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(output, {
    module: compiledModule, exports: compiledModule.exports,
    console: { ...console, error: () => {} }, process: { env: {} },
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unmocked import: ${id}`);
      return dependencies[id];
    },
  }, { filename });
  return compiledModule.exports;
}
function fixture(initial = { [A]: position(A) }, { liveReference = false } = {}) {
  const state = {
    positions: copy(initial), modes: {}, balances: { [A]: 10n ** 18n, [B]: 10n ** 18n },
    reads: [], writes: [], receipts: [], saves: [], history: [], releases: [], withdrawCalls: 0,
    allowed: true, lock: true, withdrawResult: {}, saveAttempts: 0,
  };
  class OwnerError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const json = (body, opts) => ({ status: opts?.status ?? 200, body: copy(body) });
  const store = {
    AGENT_LOCK_SEC: 90, AUTOMATION_INTERVALS: [5], AgentBusyError: class extends Error {},
    allow: async () => state.allowed,
    agentLockKey: (id) => `agent:${id}`,
    acquireLock: async (key, seconds) => {
      assert.equal(key, "agent:agent"); assert.equal(seconds, 90); return state.lock;
    },
    releaseLock: async (key) => state.releases.push(key),
    kvGet: async (key) => {
      assert.equal(key, "positions:agent");
      return liveReference ? state.positions : copy(state.positions);
    },
    kvSet: async (key, value) => {
      assert.equal(key, "positions:agent");
      state.saveAttempts++;
      if (state.persistenceError || state.persistenceFailAt === state.saveAttempts)
        throw new Error("position persistence unavailable");
      state.positions = liveReference ? value : copy(value); state.saves.push(copy(value));
    },
    pushHistory: async (_id, entry) => state.history.push(copy(entry)),
  };
  const client = {
    readContract: async (call) => {
      assert.equal(call.functionName, "balanceOf");
      assert.deepEqual(Array.from(call.args), [wallet]);
      state.reads.push(call.address);
      if (state.modes[call.address] === "read") throw new Error("balance RPC unavailable");
      return state.balances[call.address] ?? 0n;
    },
    waitForTransactionReceipt: async (call) => {
      assert.equal(call.hash, hash); assert.equal(call.timeout, 45_000);
      const token = state.writes.at(-1).address;
      state.receipts.push(token);
      if (state.modes[token] === "timeout") throw new Error("receipt timeout");
      if (state.modes[token] === "reverted") return { status: "reverted" };
      state.balances[token] = 0n;
      return { status: "success" };
    },
  };
  const viem = { ...require("viem"), createPublicClient: () => ({}), http: () => null };
  const trade = load("lib/trade.ts", {
    viem, "viem/chains": require("viem/chains"), "./argus": { arcClient: client },
    "./config": { ARC_NETWORK: "mainnet", ARC_USDC: `0x${"5".repeat(40)}`, FUCI_TREASURY: null },
    "./chain": { walletClientFor: () => ({ writeContract: async (call) => {
      assert.equal(call.functionName, "transfer");
      assert.deepEqual(Array.from(call.args), [owner, state.balances[call.address]]);
      state.writes.push(call);
      if (state.modes[call.address] === "write") throw new Error("transaction submission unavailable");
      return hash;
    } }) },
    "./agentWallets": { agentAccount: async () => ({ address: wallet }) },
    "./store": store, "./tradingRules": { TRADE_FEE_PCT: 1 },
  });
  const trading = load("lib/trading.ts", {
    viem, "./argus": {}, "./config": {}, "./trade": trade, "./store": store,
    "./tradingRules": {}, "./forest": {}, "./tradeSignals": {}, "./tradePnl": {},
  });
  const route = load("app/api/agent/[id]/automation/route.ts", {
    "next/server": { NextResponse: { json } }, "@/lib/store": store,
    "@/lib/ownerAuth": { OwnerError, verifyOwner: async () => {
      if (state.authError) throw new OwnerError("Owner signature rejected", 401);
      return { id: "agent", wallet, owner };
    } },
    "@/lib/ownerMessage": {},
    "@/lib/agentWallets": { withdrawAll: async () => {
      state.withdrawCalls++;
      if (state.withdrawError) throw new Error("stablecoin withdrawal unavailable");
      return state.withdrawResult;
    } },
    "@/lib/config": { explorerTx: (tx) => `https://explorer.invalid/tx/${tx}` },
    "@/lib/http": { errorResponse: (e) => json({ error: e.message, where: "automation" }, { status: 502 }) },
    "@/lib/trading": trading, "@/lib/trade": trade,
  });
  state.post = () => route.POST({ headers: { get: () => null }, json: async () => ({ action: "withdraw" }) },
    { params: Promise.resolve({ id: "agent" }) });
  return state;
}

for (const mode of ["read", "write", "reverted", "timeout"]) {
  test(`${mode} failure preserves complete position metadata and reports failure`, async () => {
    const s = fixture(); s.modes[A] = mode;
    const r = await s.post();
    assert.deepEqual(s.positions, { [A]: position(A) });
    assert.equal(r.status, 502); assert.equal(r.body.ok, false);
    assert.equal(r.body.code, "TOKEN_WITHDRAWAL_FAILED");
    assert.equal(r.body.partial, false); assert.deepEqual(r.body.failedTokens, [A]);
    assert.equal(r.body.tokens, 0); assert.ok(r.body.error.length > 0);
    assert.equal(s.balances[A], 10n ** 18n); assert.equal(s.saves.length, 0);
    assert.equal(s.withdrawCalls, 1); assert.deepEqual(s.releases, ["agent:agent"]);
  });
}

test("failed token remains visible for a successful later withdrawal", async () => {
  const s = fixture(); s.modes[A] = "reverted";
  await s.post(); s.modes[A] = undefined;
  const r = await s.post();
  assert.equal(s.writes.length, 2); assert.equal(s.balances[A], 0n);
  assert.deepEqual(s.positions, {}); assert.equal(r.status, 200);
  assert.equal(r.body.ok, true); assert.equal(r.body.tokens, 1);
  assert.equal(s.releases.length, 2);
});

test("mixed failure/success continues and removes only the successful keyed position", async () => {
  const s = fixture({ [A]: position(A), "legacy-position-key": position(B) });
  s.modes[A] = "read"; s.withdrawResult = { wallet: hash, gateway: null, eurc: null };
  const r = await s.post();
  assert.deepEqual(s.reads, [A, B]); assert.deepEqual(s.positions, { [A]: position(A) });
  assert.deepEqual(s.saves, [{ [A]: position(A) }]); assert.equal(s.withdrawCalls, 1);
  assert.equal(r.status, 502); assert.equal(r.body.partial, true);
  assert.equal(r.body.tokens, 1); assert.deepEqual(r.body.failedTokens, [A]);
  assert.equal(r.body.wallet, hash); assert.equal(s.history.length, 1);
});

test("successful token withdrawal alone counts as partial progress when another fails", async () => {
  const s = fixture({ [A]: position(A), [B]: position(B) }); s.modes[B] = "write";
  const r = await s.post();
  assert.deepEqual(s.positions, { [B]: position(B) });
  assert.equal(r.status, 502); assert.equal(r.body.partial, true);
  assert.equal(r.body.tokens, 1); assert.deepEqual(r.body.failedTokens, [B]);
});

test("stablecoin withdrawal alone counts as partial progress when all tokens fail", async () => {
  const s = fixture(); s.modes[A] = "read"; s.withdrawResult = { eurc: hash };
  const r = await s.post();
  assert.deepEqual(s.positions, { [A]: position(A) });
  assert.equal(r.status, 502); assert.equal(r.body.partial, true);
  assert.equal(r.body.tokens, 0); assert.equal(r.body.eurc, hash);
});

test("confirmed empty token balance removes the stale entry without counting a transfer", async () => {
  const s = fixture(); s.balances[A] = 0n;
  const r = await s.post();
  assert.deepEqual(s.positions, {}); assert.deepEqual(s.saves, [{}]);
  assert.equal(s.writes.length, 0); assert.equal(s.receipts.length, 0);
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, nothing: true });
});

test("each completed token is persisted before a later stablecoin withdrawal failure", async () => {
  const s = fixture({ [A]: position(A), [B]: position(B) }); s.withdrawError = true;
  const r = await s.post();
  assert.deepEqual(s.saves, [{ [B]: position(B) }, {}]);
  assert.deepEqual(s.positions, {}); assert.equal(s.writes.length, 2);
  assert.equal(r.status, 502); assert.match(r.body.error, /stablecoin withdrawal/);
  assert.deepEqual(s.releases, ["agent:agent"]);
});

test("position persistence failure stops subsequent sends and releases the lock", async () => {
  const s = fixture({ [A]: position(A), [B]: position(B) }); s.persistenceError = true;
  const r = await s.post();
  assert.equal(s.writes.length, 1); assert.equal(s.withdrawCalls, 0);
  assert.deepEqual(s.positions, { [A]: position(A), [B]: position(B) });
  assert.equal(r.status, 502); assert.match(r.body.error, /position persistence/);
  assert.deepEqual(s.releases, ["agent:agent"]);
});

test("memory backend retains the last persisted position when the next save fails", async () => {
  const s = fixture({ [A]: position(A), [B]: position(B) }, { liveReference: true });
  s.persistenceFailAt = 2;
  const r = await s.post();
  assert.deepEqual(copy(s.positions), { [B]: position(B) });
  assert.deepEqual(s.saves, [{ [B]: position(B) }]);
  assert.equal(s.saveAttempts, 2); assert.equal(s.writes.length, 2);
  assert.equal(s.balances[A], 0n); assert.equal(s.balances[B], 0n);
  assert.equal(s.withdrawCalls, 0); assert.equal(r.status, 502);
  assert.match(r.body.error, /position persistence/);
  assert.deepEqual(s.releases, ["agent:agent"]);
});

test("all-success response retains transaction details and records a history entry", async () => {
  const s = fixture(); s.withdrawResult = { wallet: hash, gateway: null, eurc: null };
  const r = await s.post();
  assert.deepEqual(s.positions, {}); assert.equal(s.balances[A], 0n);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, tokens: 1, wallet: hash, gateway: null, eurc: null });
  assert.equal(s.history.length, 1); assert.deepEqual(s.releases, ["agent:agent"]);
});

test("EURC-only withdrawal is returned as a withdrawal instead of nothing", async () => {
  const s = fixture({}); s.withdrawResult = { eurc: hash };
  const r = await s.post();
  assert.equal(r.status, 200); assert.deepEqual(r.body, { ok: true, tokens: 0, eurc: hash });
  assert.equal(s.history.length, 1); assert.equal(s.saves.length, 0);
});

test("no positions and no stablecoins requires no storage write or transfer", async () => {
  const s = fixture({}); const r = await s.post();
  assert.deepEqual(r.body, { ok: true, nothing: true });
  assert.equal(s.reads.length, 0); assert.equal(s.writes.length, 0); assert.equal(s.saves.length, 0);
  assert.equal(s.withdrawCalls, 1); assert.deepEqual(s.releases, ["agent:agent"]);
});

for (const [rejection, status] of [["authError", 401], ["lock", 409], ["allowed", 429]]) {
  test(`${rejection} rejection moves no funds and does not release an unacquired lock`, async () => {
    const s = fixture(); s[rejection] = rejection === "authError";
    const r = await s.post();
    assert.equal(r.status, status); assert.deepEqual(s.positions, { [A]: position(A) });
    assert.equal(s.reads.length, 0); assert.equal(s.writes.length, 0);
    assert.equal(s.withdrawCalls, 0); assert.equal(s.saves.length, 0); assert.equal(s.releases.length, 0);
  });
}
