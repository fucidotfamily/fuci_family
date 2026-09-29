import { erc20Abi, getAddress, type Address } from "viem";
import { ARC_CHAIN, ARC_USDC, EXPLORER_URL, explorerAddress } from "./config";
import { readClient } from "./chain";
import { ERC8004, IDENTITY_ABI, agentCount, explorerAgent, getHouseAgentId, reputationOf, validationsOf, type Reputation } from "./erc8004";
import { agentCardOf, storedIndex } from "./agentIndex";
import { COMPLETENESS_CHECKS } from "./agentQuery";
import { getStats, kvGet, kvSet, payerRecord, type PayerRecord } from "./store";
import { finish, type Evidence, type Factor, type Grade, type RiskReport } from "./risk/score";

/**
 * Know Your Agent (KYA): before paying, hiring or trusting another AI agent, check who it is on Arc.
 * Built from on-chain data only: its ERC-8004 identity (Identity, Reputation and Validation registries),
 * its registration file, its wallet's activity and USDC balance, and the x402 payments Fuci has settled
 * from that wallet. A check that can't be read is reported as unknown, never assumed safe.
 */

export class KyaInputError extends Error {}

export type KyaSubject = {
  /** The ERC-8004 agentId, or null when the wallet has no identity. */
  agentId: number | null;
  name: string | null;
  owner: Address | null;
  /** The wallet the agent pays from (ERC-8004 agentWallet, else its owner), or the address asked about. */
  wallet: Address;
  cardUrl: string | null;
  x402Support: boolean;
  builtOnFuci: boolean;
  /** Other ERC-8004 agents tied to the same wallet (as owner or agentWallet). */
  otherAgentIds: number[];
  explorer: string;
};

export type KyaReport = RiskReport & { subject: KyaSubject };

const TTL_SEC = 15 * 60;
const client = () => readClient(ARC_CHAIN);
const FUCI_HOSTS = ["www.fuci.family", "fuci.family", "fuci.vercel.app"];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** `agent` is an ERC-8004 agentId ("12" or "#12") or a wallet address (0x…). */
export async function getKya(agent: string): Promise<KyaReport> {
  const q = agent.trim().toLowerCase().replace(/^#/, "");
  const isAddress = /^0x[0-9a-f]{40}$/.test(q);
  if (!isAddress && !/^\d{1,9}$/.test(q)) throw new KyaInputError("Give an ERC-8004 agent id (e.g. 12) or a wallet address on Arc (0x…)");
  const key = `kya:v1:${q}`;
  const hit = await kvGet<KyaReport>(key).catch(() => null);
  if (hit) return hit;
  const report = await buildKya(q, isAddress);
  await kvSet(key, report, TTL_SEC).catch(() => undefined);
  return report;
}

/** owner and agentWallet of every registered agent, for looking a wallet up (cached 10 minutes). */
async function walletMap(): Promise<{ id: number; owner: string | null; wallet: string | null }[]> {
  const key = `kya:v1:wallets`;
  const hit = await kvGet<{ id: number; owner: string | null; wallet: string | null }[]>(key).catch(() => null);
  if (hit) return hit;
  const total = await agentCount();
  const ids = Array.from({ length: total }, (_, i) => i);
  const out: { id: number; owner: string | null; wallet: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await client().multicall({
      allowFailure: true,
      contracts: chunk.flatMap((id) => [
        { address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "ownerOf", args: [BigInt(id)] } as const,
        { address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "getAgentWallet", args: [BigInt(id)] } as const,
      ]),
    });
    chunk.forEach((id, k) => {
      const o = res[2 * k];
      const w = res[2 * k + 1];
      const addr = (r: typeof o) => (r.status === "success" && typeof r.result === "string" && !/^0x0+$/.test(r.result) ? r.result.toLowerCase() : null);
      out.push({ id, owner: addr(o), wallet: addr(w) });
    });
  }
  await kvSet(key, out, TTL_SEC).catch(() => undefined);
  return out;
}

async function buildKya(q: string, isAddress: boolean): Promise<KyaReport> {
  // 1. Resolve the identity.
  let agentId: number | null = null;
  let others: number[] = [];
  if (isAddress) {
    const map = await walletMap();
    const house = await getHouseAgentId().catch(() => null);
    const mine = map.filter((m) => m.wallet === q || m.owner === q).map((m) => m.id);
    // Prefer an identity whose agentWallet is this address; the site's own house agent last.
    const order = [...mine].sort((a, b) => Number(map[b]?.wallet === q) - Number(map[a]?.wallet === q) || Number(a === house) - Number(b === house) || b - a);
    agentId = order[0] ?? null;
    others = order.slice(1, 11);
  } else {
    agentId = Number(q);
  }

  let owner: Address | null = null;
  let uri: string | null = null;
  let agentWallet: Address | null = null;
  if (agentId !== null) {
    const id = BigInt(agentId);
    const [o, u, w] = await Promise.allSettled([
      client().readContract({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "ownerOf", args: [id] }),
      client().readContract({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "tokenURI", args: [id] }),
      client().readContract({ address: ERC8004.identity, abi: IDENTITY_ABI, functionName: "getAgentWallet", args: [id] }),
    ]);
    if (o.status === "rejected") {
      if (!isAddress) throw new KyaInputError(`No agent #${agentId} in the ERC-8004 registry on Arc`);
      agentId = null;
    } else {
      owner = o.value;
      uri = u.status === "fulfilled" ? u.value : null;
      agentWallet = w.status === "fulfilled" && !/^0x0+$/.test(w.value) ? w.value : null;
    }
  }
  const wallet = getAddress(isAddress ? q : (agentWallet ?? owner)!);
  const w = wallet.toLowerCase();

  // 2. Read everything else in parallel.
  const [card, rep, vals, stored, nonce, code, usdc, record, stats] = await Promise.all([
    uri ? agentCardOf(uri).catch(() => null) : Promise.resolve(null),
    agentId !== null ? reputationOf(agentId).catch(() => null) : Promise.resolve(null),
    agentId !== null ? validationsOf(agentId).catch(() => null) : Promise.resolve(null),
    storedIndex().catch(() => null),
    client()
      .getTransactionCount({ address: wallet })
      .catch(() => null),
    client()
      .getCode({ address: wallet })
      .catch(() => null),
    client()
      .readContract({ address: ARC_USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet] })
      .catch(() => null),
    payerRecord(w).catch(() => null),
    getStats().catch(() => null),
  ]);
  const block = await client()
    .getBlockNumber()
    .catch(() => null);
  const ranked = agentId !== null ? stored?.index?.agents.find((a) => a.agentId === agentId) : undefined;
  const host = uri ? hostOf(uri) : null;
  const builtOnFuci = Boolean(host && FUCI_HOSTS.includes(host));
  // Payments seen in the recent feed also count (they predate the per-wallet record).
  const recent = (stats?.recent ?? []).filter((e) => e.kind === "payment" && e.payer === w);
  const paid: PayerRecord | null = record
    ? record.calls >= recent.length
      ? record
      : {
          calls: recent.length,
          usdc: recent.reduce((s, e) => s + e.usdc, 0),
          firstAt: recent.at(-1)?.at ?? null,
          lastAt: recent[0]?.at ?? null,
        }
    : null;

  const factors: Factor[] = [];
  const redFlags: string[] = [];
  const caps: { grade: Grade; reason: string }[] = [];
  const idLink: Evidence[] = agentId !== null ? [{ label: `ERC-8004 agent #${agentId}`, href: explorerAgent(agentId) }] : [];

  // Identity
  // A Fuci agent's own wallet that its owner hasn't linked on-chain yet (setAgentWallet): say so, grade unchanged.
  const fuciAgent = agentId === null && isAddress ? await import("./store").then((m) => m.agentByWallet(wallet)).catch(() => null) : null;
  const pendingLink = fuciAgent?.erc8004Id !== undefined && fuciAgent ? `This is the wallet of Fuci agent "${fuciAgent.name}" (ERC-8004 #${fuciAgent.erc8004Id}), but its owner hasn't linked it on-chain yet, so the registry doesn't show it.` : null;
  if (agentId === null) {
    factors.push({
      key: "identity",
      label: "On-chain identity",
      score: 0,
      weight: 25,
      summary: pendingLink ?? "This wallet has no ERC-8004 identity on Arc: nobody has registered it as an agent.",
      details: ["Checked every agent in the ERC-8004 Identity Registry for this address as owner or agent wallet.", `Registry: ${ERC8004.identity}`],
      evidence: [{ label: "Identity Registry", href: `${EXPLORER_URL}/address/${ERC8004.identity}` }],
    });
    redFlags.push(pendingLink ? `Not linked on-chain yet: Fuci says this is agent #${fuciAgent!.erc8004Id}'s wallet, but the registry doesn't confirm it` : "No ERC-8004 identity: this wallet is not a registered agent");
    caps.push({ grade: "D", reason: "a wallet with no on-chain identity" });
  } else {
    const details = [`Agent #${agentId}, owned by ${owner}.`];
    if (agentWallet && agentWallet.toLowerCase() !== owner?.toLowerCase()) details.push(`Pays from its own agent wallet ${agentWallet}.`);
    else details.push(agentWallet ? "Its agent wallet is the owner's wallet." : "No separate agent wallet is set; the owner's wallet is used.");
    if (others.length) details.push(`The same wallet is tied to ${others.length} other agent${others.length === 1 ? "" : "s"}: #${others.join(", #")}.`);
    factors.push({
      key: "identity",
      label: "On-chain identity",
      score: 100,
      weight: 25,
      summary: `Registered on Arc as ERC-8004 agent #${agentId}${card?.name ? ` (“${card.name}”)` : ""}.`,
      details,
      evidence: idLink,
    });
  }

  // Registration file (read live; the directory's last read stands in when the host doesn't answer)
  if (agentId !== null && (card || ranked)) {
    const checks: [string, boolean][] = card
      ? [
          ["readable registration file", true],
          ["name", Boolean(card.name)],
          ["description", Boolean(card.description)],
          ["image", Boolean(card.image)],
          ["service endpoint", card.services > 0],
          ["x402 support", card.x402Support],
          ["lists its own registration", card.registeredIds.includes(agentId)],
          ["trust model declared", card.trust],
        ]
      : COMPLETENESS_CHECKS.map((c) => [c, !ranked!.missing.includes(c)]);
    const done = checks.filter(([, ok]) => ok).length;
    factors.push({
      key: "registration",
      label: "Registration file",
      score: Math.round((100 * done) / checks.length),
      weight: 15,
      summary: `The agent's public card has ${done} of ${checks.length} expected fields.`,
      details: [
        ...checks.map(([label, ok]) => `${ok ? "✓" : "✗"} ${label}`),
        ...(card ? [] : ["From Fuci's directory (the card's host didn't answer just now)."]),
        ...(ranked ? [`Ranked #${ranked.rank} of ${stored!.index!.total} agents in Fuci's ERC-8004 directory.`] : []),
      ],
      evidence: uri && /^https:\/\//.test(uri) ? [{ label: "Registration file", href: uri.slice(0, 300) }] : [],
    });
  } else if (agentId !== null) {
    factors.push({
      key: "registration",
      label: "Registration file",
      score: null,
      weight: 15,
      summary: "The agent's registration file couldn't be read, so we can't see what it claims to do.",
      details: uri ? [`URI: ${uri.slice(0, 120)}`] : ["The identity has no registration URI."],
    });
    caps.push({ grade: "C", reason: "an unreadable registration file" });
  } else {
    factors.push({ key: "registration", label: "Registration file", score: null, weight: 15, summary: "No identity, so no registration file to read.", details: [] });
  }

  // Reputation
  factors.push(reputationFactor(agentId, rep, idLink));

  // Validations
  if (agentId === null) factors.push({ key: "validation", label: "Independent validation", score: null, weight: 5, summary: "No identity, so no validations.", details: [] });
  else if (vals === null) factors.push({ key: "validation", label: "Independent validation", score: null, weight: 5, summary: "The Validation Registry didn't answer.", details: [] });
  else {
    const passed = vals.filter((v) => v.responded && v.response >= 50).length;
    factors.push({
      key: "validation",
      label: "Independent validation",
      score: vals.length === 0 ? 40 : passed > 0 ? 90 : 30,
      weight: 5,
      summary:
        vals.length === 0 ? "No validator has checked this agent's work yet." : `${vals.length} validation request${vals.length === 1 ? "" : "s"}, ${passed} passed (response ≥ 50).`,
      details: vals.slice(0, 5).map((v) => `${short(v.validator)}: ${v.responded ? `response ${v.response}${v.tag ? ` (${v.tag})` : ""}` : "pending"}`),
      evidence: [{ label: "Validation Registry", href: `${EXPLORER_URL}/address/${ERC8004.validation}` }],
    });
  }

  // Wallet activity
  if (nonce === null) factors.push({ key: "activity", label: "Wallet activity", score: null, weight: 15, summary: "Couldn't read the wallet from Arc.", details: [] });
  else {
    const contract = Boolean(code && code !== "0x");
    const score = contract ? (nonce === 0 ? 60 : 80) : nonce === 0 ? 15 : nonce < 10 ? 45 : nonce < 100 ? 70 : 90;
    factors.push({
      key: "activity",
      label: "Wallet activity",
      score,
      weight: 15,
      summary: contract
        ? `A smart-contract wallet on Arc${nonce ? ` that has deployed ${nonce} contract${nonce === 1 ? "" : "s"}` : ""}; its activity isn't counted by nonce.`
        : nonce === 0
          ? "This wallet has never sent a transaction on Arc."
          : `This wallet has sent ${nonce.toLocaleString("en-US")} transaction${nonce === 1 ? "" : "s"} on Arc.`,
      details: [`Wallet: ${wallet}`, contract ? "Type: smart contract (e.g. a Safe or an ERC-4337 account)" : "Type: externally owned account (a private key)"],
      evidence: [{ label: short(wallet), href: explorerAddress(wallet) }],
    });
    if (!contract && nonce === 0) caps.push({ grade: "D", reason: "a wallet that has never sent a transaction" });
  }

  // Funds
  if (usdc === null) factors.push({ key: "funds", label: "USDC on Arc", score: null, weight: 5, summary: "Couldn't read the USDC balance.", details: [] });
  else {
    const bal = Number(usdc) / 1e6;
    factors.push({
      key: "funds",
      label: "USDC on Arc",
      score: bal < 0.01 ? 30 : bal < 1 ? 60 : 85,
      weight: 5,
      summary: bal < 0.01 ? "The wallet holds almost no USDC on Arc (under 0.01), so it can't pay from Arc right now." : `The wallet holds ${bal.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC on Arc.`,
      details: ["Gateway balances on other chains aren't counted here."],
    });
  }

  // x402 track record at Fuci
  if (paid === null) factors.push({ key: "payments", label: "x402 payment record", score: null, weight: 10, summary: "Fuci's payment record didn't answer.", details: [] });
  else {
    const n = paid.calls;
    factors.push({
      key: "payments",
      label: "x402 payment record",
      score: n === 0 ? 50 : n < 10 ? 70 : n < 100 ? 85 : 95,
      weight: 10,
      summary:
        n === 0
          ? "Fuci hasn't settled any x402 payment from this wallet yet."
          : `Fuci has settled ${n.toLocaleString("en-US")} paid x402 call${n === 1 ? "" : "s"} from this wallet (${paid.usdc.toFixed(4)} USDC).`,
      details: [
        ...(paid.firstAt ? [`First seen ${ago(paid.firstAt)}.`] : []),
        ...(paid.lastAt ? [`Last paid ${ago(paid.lastAt)}.`] : []),
        "Counts only payments made to Fuci's own tools, settled through Circle Gateway.",
      ],
    });
  }

  const subject: KyaSubject = {
    agentId,
    name: card?.name ?? ranked?.name ?? null,
    owner,
    wallet,
    cardUrl: uri && /^https:\/\//.test(uri) ? uri.slice(0, 300) : null,
    x402Support: Boolean(card?.x402Support ?? ranked?.x402),
    builtOnFuci,
    otherAgentIds: others,
    explorer: agentId !== null ? explorerAgent(agentId) : explorerAddress(wallet),
  };

  const report = finish(
    {
      kind: "agent",
      id: agentId !== null ? String(agentId) : w,
      name: card?.name ?? ranked?.name ?? (agentId !== null ? `Agent #${agentId}` : short(wallet)),
      factors,
      redFlags,
      sources: [
        { label: "ERC-8004 Identity Registry", href: `${EXPLORER_URL}/address/${ERC8004.identity}` },
        { label: "ERC-8004 Reputation Registry", href: `${EXPLORER_URL}/address/${ERC8004.reputation}` },
        { label: "Arc mainnet RPC" },
      ],
      ...(block !== null ? { block: Number(block) } : {}),
    },
    caps,
  );
  return { ...report, label: kyaLabel(report.grade), subject };
}

function reputationFactor(agentId: number | null, rep: Reputation | null, evidence: Evidence[]): Factor {
  const base = { key: "reputation", label: "Reputation", weight: 25 };
  if (agentId === null) return { ...base, score: null, summary: "No identity, so no reputation to read.", details: [] };
  if (rep === null) return { ...base, score: null, summary: "The Reputation Registry didn't answer.", details: [] };
  if (rep.count === 0 || rep.score === null) return { ...base, score: 40, summary: "No one has left on-chain feedback for this agent yet.", details: ["New agents start here; feedback comes from clients who used it."], evidence };
  // Feedback values are usually 0–100. Until 3 clients have rated it, the score leans toward the no-feedback level (40).
  const avg = Math.max(0, Math.min(100, rep.score));
  const w = Math.min(rep.clients, 3) / 3;
  const score = 40 * (1 - w) + avg * w;
  return {
    ...base,
    score: Math.round(score),
    summary: `${rep.count} on-chain rating${rep.count === 1 ? "" : "s"} from ${rep.clients} client${rep.clients === 1 ? "" : "s"}, averaging ${avg.toFixed(0)}/100.`,
    details: rep.clients < 3 ? ["Fewer than 3 clients rated it, so the score leans toward the no-feedback level until more do."] : [],
    evidence: [...evidence, { label: "Reputation Registry", href: `${EXPLORER_URL}/address/${ERC8004.reputation}` }],
  };
}

function kyaLabel(g: Grade | null) {
  return g === "A" ? "Well-established agent" : g === "B" ? "Established agent" : g === "C" ? "Little track record" : g === "D" ? "Unproven: be careful" : g === "F" ? "Do not trust yet" : "Not enough data";
}

function hostOf(uri: string) {
  try {
    return new URL(uri).hostname;
  } catch {
    return null;
  }
}

