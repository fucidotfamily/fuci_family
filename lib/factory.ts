import { isAddress, type Address } from "viem";
import { ARC_CHAIN, ARC_NETWORK } from "./config";
import { readClient } from "./chain";
import { FACTORY_ABI } from "./factoryArtifact";
import { kvGet, kvSet } from "./store";

/**
 * The FuciAgentFactory contract: creating an agent on Arc costs its fee (1 USDC) paid to the
 * treasury, mints the ERC-8004 identity and emits AgentCreated. The address comes from
 * NEXT_PUBLIC_AGENT_FACTORY, or from the deployment the owner made on /setup.
 */
const KEY = `factory:${ARC_NETWORK}`;

export async function factoryAddress(): Promise<Address | null> {
  const env = (process.env.NEXT_PUBLIC_AGENT_FACTORY ?? "").trim();
  if (isAddress(env)) return env;
  const stored = await kvGet<string>(KEY).catch(() => null);
  return stored && isAddress(stored) ? stored : null;
}

export const saveFactoryAddress = (a: Address) => kvSet(KEY, a);

export async function factoryInfo() {
  const address = await factoryAddress();
  if (!address) return null;
  const c = readClient(ARC_CHAIN);
  const read = <T>(functionName: "fee" | "treasury" | "owner" | "agentsCreated") => c.readContract({ address, abi: FACTORY_ABI, functionName }) as Promise<T>;
  const [fee, treasury, owner, agentsCreated] = await Promise.all([read<bigint>("fee"), read<Address>("treasury"), read<Address>("owner"), read<bigint>("agentsCreated")]);
  return { address, feeUsdc: Number(fee) / 1e6, fee: fee.toString(), treasury, owner, agentsCreated: Number(agentsCreated) };
}
