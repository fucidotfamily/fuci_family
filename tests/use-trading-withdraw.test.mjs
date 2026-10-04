import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Exercise the real hook without rendering JSX or contacting a wallet/RPC.
const sourcePath = fileURLToPath(new URL("../components/useTrading.ts", import.meta.url));
const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  fileName: sourcePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const agent = { id: "withdraw-test", owner: "0x1111111111111111111111111111111111111111", ownerKind: "browser" };
const urls = [`/api/agent/${agent.id}/trading`, `/api/agent/${agent.id}/automation`];

function fixture({ postError } = {}) {
  const values = [];
  const messages = [];
  const requests = [];
  const posts = [];
  const trading = { trading: null, positions: [{ token: "still-tracked" }], spentToday: 0, available: true };
  const wallet = { address: "agent-wallet", walletUsdc: 0.01, gatewayUsdc: 0 };
  const exports = {};
  const unused = () => { throw new Error("Unexpected fixture dependency call"); };
  const dependencies = {
    react: {
      useState(initial) {
        const index = values.length;
        values.push(initial);
        return [initial, (next) => {
          values[index] = typeof next === "function" ? next(values[index]) : next;
          if (index === 3 && values[index]) messages.push(structuredClone(values[index]));
        }];
      },
      useCallback: (callback) => callback,
      useEffect: () => undefined,
    },
    viem: { parseUnits: unused },
    "./OwnerTools": {
      signed: async () => ({ address: agent.owner, issuedAt: 1, signature: "signed-fixture" }),
      post: async (url, body) => {
        posts.push({ url, body: structuredClone(body) });
        if (postError) throw postError;
        return { ok: true, tokens: 1, wallet: "confirmed-tx" };
      },
    },
    "@/lib/browserWallet": {
      SITE_CHAIN: {}, errText: (error) => error.message,
      sendInjected: unused, sendPasskey: unused,
    },
    "@/lib/tradingRules": { normalizeTrading: unused, tradingDetail: unused },
  };
  new vm.Script(compiled, { filename: sourcePath }).runInNewContext({
    exports,
    module: { exports },
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected module: ${name}`);
      return dependencies[name];
    },
    fetch: async (url, options) => {
      requests.push({ url, options: structuredClone(options) });
      assert.ok(urls.includes(url), `Unexpected fetch: ${url}`);
      return { json: async () => url === urls[0] ? trading : { wallet } };
    },
  });
  return { ops: exports.useTrading(agent, true), values, messages, requests, posts, trading, wallet };
}

test("incomplete withdrawal refreshes remaining positions and shows an error, never success", async () => {
  const message = "Withdrawal incomplete: one token transfer could not be confirmed. Its position is still tracked.";
  const f = fixture({ postError: new Error(message) });

  assert.equal(await f.ops.withdraw(), false);
  assert.deepEqual(f.messages, [{ ok: false, text: message, where: "wallet" }]);
  assert.equal(f.values[2], null, "busy state is released after failure");
  assert.deepEqual(f.requests.map((request) => request.url), urls,
    "reload positions and balances immediately after a failed/partial withdrawal");
  assert.equal(f.values[0], f.trading);
  assert.equal(f.values[1], f.wallet);
});

test("successful withdrawal uses one ordinary refresh and keeps the success result", async () => {
  const f = fixture();

  assert.equal(await f.ops.withdraw(), true);
  assert.deepEqual(f.messages, [{ ok: true, text: "Done. The agent's USDC and tokens are back in your wallet.", where: "wallet" }]);
  assert.deepEqual(f.requests.map((request) => request.url), urls,
    "the successful path refreshes once, with two GET requests");
  assert.ok(f.requests.every((request) => request.options.cache === "no-store"));
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].url, urls[1]);
  assert.equal(f.posts[0].body.action, "withdraw");
  assert.equal(f.values[0], f.trading);
  assert.equal(f.values[1], f.wallet);
  assert.equal(f.values[2], null);
});
