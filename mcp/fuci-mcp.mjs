#!/usr/bin/env node
/**
 * fuci-mcp: an MCP server (stdio) that gives any MCP client (Claude, Cursor, …) Fuci's tools.
 * Paid tools are bought over x402 with USDC from YOUR wallet via Circle Gateway (gas-free),
 * under a spending policy read from the environment, which the model cannot change.
 *
 * Env:
 *   FUCI_PRIVATE_KEY or FUCI_KEY_FILE   your agent wallet key (a fresh wallet with a little USDC)
 *   FUCI_URL        default https://www.fuci.family
 *   FUCI_MAX_CALL   max USDC per payment, default 0.01
 *   FUCI_DAILY      max USDC per day, default 1
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { registerBatchScheme, GatewayClient } from "@circle-fin/x402-batching/client";

const BASE = (process.env.FUCI_URL || "https://www.fuci.family").replace(/\/$/, "");
const MAX_CALL = Number(process.env.FUCI_MAX_CALL || 0.01);
const DAILY = Number(process.env.FUCI_DAILY || 1);
const USDC = "0x3600000000000000000000000000000000000000";
const VERSION = "0.1.0";

const log = (...a) => process.stderr.write(`[fuci-mcp] ${a.join(" ")}\n`);

function loadKey() {
  let key = process.env.FUCI_PRIVATE_KEY?.trim();
  if (!key && process.env.FUCI_KEY_FILE) key = readFileSync(process.env.FUCI_KEY_FILE, "utf8").trim();
  if (!key) return null;
  if (!key.startsWith("0x")) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("FUCI_PRIVATE_KEY is not a 32-byte hex key");
  return key;
}

// --- daily spend ledger (~/.fuci-mcp/spend.json) -------------------------------------------
const LEDGER_DIR = join(homedir(), ".fuci-mcp");
const LEDGER = join(LEDGER_DIR, "spend.json");
const today = () => new Date().toISOString().slice(0, 10);
function spentToday() {
  try {
    const l = JSON.parse(readFileSync(LEDGER, "utf8"));
    return l.day === today() ? Number(l.usdc) || 0 : 0;
  } catch {
    return 0;
  }
}
function addSpend(usdc) {
  mkdirSync(LEDGER_DIR, { recursive: true });
  writeFileSync(LEDGER, JSON.stringify({ day: today(), usdc: Math.round((spentToday() + usdc) * 1e6) / 1e6 }));
}

// --- Fuci discovery ----------------------------------------------------------------------------
let manifest = null;
async function getManifest() {
  if (!manifest) {
    const res = await fetch(`${BASE}/.well-known/x402`);
    if (!res.ok) throw new Error(`Could not reach ${BASE} (HTTP ${res.status})`);
    manifest = await res.json();
  }
  return manifest;
}
const chainOf = (network) => (network === "eip155:5042002" ? "arcTestnet" : "arc");
const usdcOf = (price) => Number(String(price).replace(/[^0-9.]/g, ""));

// --- payments --------------------------------------------------------------------------------
let payer = null;
async function getPayer() {
  if (payer) return payer;
  const key = loadKey();
  if (!key) throw new Error("No wallet: set FUCI_PRIVATE_KEY (or FUCI_KEY_FILE) in the MCP server's env");
  const m = await getManifest();
  const account = privateKeyToAccount(key);
  const client = new x402Client();
  client.setSpendControls({ allowedAssets: [{ network: m.network, asset: USDC, maxAmountPerPayment: String(Math.round(MAX_CALL * 1e6)) }] });
  const scheme = registerBatchScheme(client, { signer: account, networks: [m.network] });
  scheme.onBeforePaymentCreation(async (ctx) => {
    const usdc = Number(ctx.selectedRequirements.amount) / 1e6;
    if (usdc > MAX_CALL + 1e-9) return { abort: true, reason: `over the per-call limit (${MAX_CALL} USDC)` };
    if (spentToday() + usdc > DAILY + 1e-9) return { abort: true, reason: `daily limit reached (${DAILY} USDC)` };
  });
  const gateway = new GatewayClient({ chain: chainOf(m.network), privateKey: key });
  payer = { account, fetch: wrapFetchWithPayment(fetch, client), gateway };
  return payer;
}

async function payAndCall(resource, args) {
  const p = await getPayer();
  const url = new URL(resource.url);
  const init = { method: resource.method, headers: { "x-fuci-agent": "mcp" } };
  if (resource.method === "GET") for (const [k, v] of Object.entries(args ?? {})) url.searchParams.set(k, String(v));
  else {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(args ?? {});
  }
  const res = await p.fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    let reason = text.slice(0, 300);
    const h = res.headers.get("PAYMENT-RESPONSE") || res.headers.get("PAYMENT-REQUIRED");
    if (h) {
      try {
        const b = JSON.parse(Buffer.from(h, "base64").toString("utf8"));
        if (b.errorReason === "insufficient_balance") reason = "Gateway balance is empty: call fuci_deposit first (wallet needs USDC on Arc).";
        else if (b.errorReason || b.error) reason = b.errorReason || b.error;
      } catch {}
    }
    throw new Error(`${res.status}: ${reason}`);
  }
  const usdc = usdcOf(resource.price);
  addSpend(usdc);
  let tx = null;
  const receipt = res.headers.get("PAYMENT-RESPONSE");
  if (receipt) {
    try {
      tx = decodePaymentResponseHeader(receipt)?.transaction ?? null;
    } catch {}
  }
  return { paid: `${usdc} USDC`, tx, spentToday: spentToday(), data: safeJson(text) };
}
const safeJson = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};

// --- tools -------------------------------------------------------------------------------------
const LOCAL_TOOLS = [
  { name: "fuci_balance", description: "Free. Your wallet's USDC on Arc, your Circle Gateway balance (what x402 payments spend), and today's spend against the limit.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  {
    name: "fuci_deposit",
    description: "Move USDC from your wallet into Circle Gateway so paid tools can be used (an on-chain transaction; USDC is also Arc's gas).",
    inputSchema: { type: "object", properties: { amount: { type: "number", description: "USDC to deposit, e.g. 1" } }, required: ["amount"], additionalProperties: false },
  },
  { name: "fuci_reputation", description: "Free. ERC-8004 identity, reputation and validations for any agent on Arc.", inputSchema: { type: "object", properties: { agentId: { type: "number" } }, required: ["agentId"], additionalProperties: false } },
];

async function listTools() {
  const m = await getManifest();
  const paid = m.resources.map((r) => ({
    name: r.id,
    description: `${r.name}: paid ${r.price} USDC per call over x402 from your wallet (limit ${MAX_CALL}/call, ${DAILY}/day).`,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(Object.entries(r.input ?? {}).map(([k, v]) => [k, { type: v.type, description: v.description }])),
      additionalProperties: false,
    },
  }));
  return [...LOCAL_TOOLS, ...paid];
}

async function callTool(name, args) {
  if (name === "fuci_balance") {
    const p = await getPayer();
    const b = await p.gateway.getBalances();
    return { address: p.account.address, walletUsdc: b.wallet.formatted, gatewayUsdc: b.gateway.formattedAvailable, spentToday: spentToday(), dailyLimit: DAILY, perCallLimit: MAX_CALL };
  }
  if (name === "fuci_deposit") {
    const amount = Number(args?.amount);
    if (!(amount > 0 && amount <= 100)) throw new Error("amount must be between 0 and 100 USDC");
    const p = await getPayer();
    const r = await p.gateway.deposit(String(amount));
    return { deposited: `${amount} USDC`, tx: r.depositTxHash };
  }
  if (name === "fuci_reputation") {
    const res = await fetch(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "fuci_reputation", arguments: { agentId: args?.agentId } } }),
    });
    return (await res.json()).result?.structuredContent ?? { error: "not found" };
  }
  const m = await getManifest();
  const resource = m.resources.find((r) => r.id === name);
  if (!resource) throw new Error(`Unknown tool ${name}`);
  return payAndCall(resource, args);
}

// --- MCP over stdio (newline-delimited JSON-RPC) -----------------------------------------------
const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  if (msg.id === undefined) return; // notifications
  const reply = (result) => send({ jsonrpc: "2.0", id: msg.id, result });
  try {
    switch (msg.method) {
      case "initialize":
        return reply({
          protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "fuci", version: VERSION },
          instructions: `Fuci tools on Arc. Paid tools spend USDC from the user's wallet over x402 (max ${MAX_CALL} per call, ${DAILY} per day). Use fuci_balance before paying; if the Gateway balance is empty, ask the user before calling fuci_deposit.`,
        });
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: await listTools() });
      case "tools/call": {
        try {
          const out = await callTool(msg.params?.name, msg.params?.arguments ?? {});
          return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: false });
        } catch (e) {
          return reply({ content: [{ type: "text", text: e.message ?? String(e) }], isError: true });
        }
      }
      default:
        return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
    }
  } catch (e) {
    send({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: e.message ?? String(e) } });
  }
});
log(`ready · ${BASE} · limit ${MAX_CALL} USDC/call, ${DAILY} USDC/day`);
