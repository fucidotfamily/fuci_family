import { arc, arcTestnet } from "viem/chains";
import { createPublicClient, createWalletClient, custom, http, numberToHex, type Abi, type Chain, type Hex, type Transport } from "viem";

/**
 * Browser-side contract calls: an injected wallet (MetaMask, Rabby, …) switched to the
 * right Arc chain, or the Circle passkey smart account saved by HoldfastWallet.
 */
type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
export const injected = () => (typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Eip1193 }).ethereum);

export async function connectInjected(chain: Chain) {
  const eth = injected();
  if (!eth) throw new Error("No browser wallet found. Install Rabby or MetaMask.");
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
  if (!address) throw new Error("No account was shared");
  const chainId = numberToHex(chain.id);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : [],
        },
      ],
    });
  }
  return { address, wallet: createWalletClient({ chain, account: address, transport: custom(eth) }) };
}

export type Call = { address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] };

export const publicClient = (chain: Chain) => createPublicClient({ chain, transport: http() });

/** Send one contract call from the injected wallet and wait for it to be mined. */
export async function sendInjected(chain: Chain, call: Call): Promise<{ hash: Hex; from: `0x${string}` }> {
  const { address, wallet } = await connectInjected(chain);
  const pub = publicClient(chain);
  // Simulate first so a revert shows its reason instead of a failed transaction.
  await pub.simulateContract({ ...call, account: address } as Parameters<typeof pub.simulateContract>[0]);
  const hash = await wallet.writeContract({ ...call, account: address, chain } as Parameters<typeof wallet.writeContract>[0]);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return { hash, from: address };
}

const CLIENT_KEY = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY ?? "";
const CLIENT_URL = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL || "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
export const PASSKEY_STORAGE_KEY = "fuci-holdfast-credential";

/** Send calls as a user operation from the Circle passkey smart account (Circle's bundler). */
export async function sendPasskey(chain: Chain, calls: Call[]): Promise<{ hash: Hex; from: `0x${string}` }> {
  if (!CLIENT_KEY) throw new Error("Passkey wallets are not enabled on this site");
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(PASSKEY_STORAGE_KEY);
  } catch {
    saved = null;
  }
  if (!saved) throw new Error("Log in with your passkey on /spawn first, on this device");
  const mw = await import("@circle-fin/modular-wallets-core");
  const { toWebAuthnAccount, createBundlerClient } = await import("viem/account-abstraction");
  const transport = mw.toModularTransport(`${CLIENT_URL}/${chain.testnet ? "arcTestnet" : "arc"}`, CLIENT_KEY) as unknown as Transport;
  const client = createPublicClient({ chain, transport });
  type SmartAccountParams = Parameters<typeof mw.toCircleSmartAccount>[0];
  const account = await mw.toCircleSmartAccount({
    client: client as unknown as SmartAccountParams["client"],
    owner: toWebAuthnAccount({ credential: JSON.parse(saved) }) as unknown as SmartAccountParams["owner"],
  });
  // The Circle SDK bundles its own viem copy, so the account type is bridged by hand.
  const bundler = createBundlerClient({ account: account as never, client, chain, transport }) as unknown as {
    sendUserOperation: (args: { calls: Call[]; paymaster: boolean }) => Promise<Hex>;
    waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{ receipt: { status: string; transactionHash: Hex } }>;
  };
  const userOp = await bundler.sendUserOperation({ calls, paymaster: true });
  const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOp });
  if (receipt.status !== "success") throw new Error(`User operation reverted: ${receipt.transactionHash}`);
  return { hash: receipt.transactionHash, from: account.address as `0x${string}` };
}

export const errText = (e: unknown) => {
  const err = e as { shortMessage?: string; details?: string; message?: string };
  return (err?.shortMessage ?? err?.details ?? err?.message ?? String(e)).slice(0, 300);
};

/** The chain the site (and its ERC-8004 registries) runs on. */
export const SITE_CHAIN = process.env.NEXT_PUBLIC_ARC_NETWORK === "testnet" ? arcTestnet : arc;

/** Sign a plain message as an agent's owner: the injected wallet, or the Circle passkey account. */
export async function signAsOwner(ownerKind: "browser" | "passkey", owner: string, message: string): Promise<{ address: string; signature: Hex }> {
  if (ownerKind === "passkey") {
    if (!CLIENT_KEY) throw new Error("Passkey wallets are not enabled on this site");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(PASSKEY_STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (!saved) throw new Error("Log in with your passkey on /spawn first, on this device");
    const mw = await import("@circle-fin/modular-wallets-core");
    const { toWebAuthnAccount } = await import("viem/account-abstraction");
    const transport = mw.toModularTransport(`${CLIENT_URL}/${SITE_CHAIN.testnet ? "arcTestnet" : "arc"}`, CLIENT_KEY) as unknown as Transport;
    const client = createPublicClient({ chain: SITE_CHAIN, transport });
    type SmartAccountParams = Parameters<typeof mw.toCircleSmartAccount>[0];
    const account = await mw.toCircleSmartAccount({
      client: client as unknown as SmartAccountParams["client"],
      owner: toWebAuthnAccount({ credential: JSON.parse(saved) }) as unknown as SmartAccountParams["owner"],
    });
    if (account.address.toLowerCase() !== owner.toLowerCase()) throw new Error("This passkey is not the agent's owner");
    return { address: account.address, signature: (await account.signMessage({ message })) as Hex };
  }
  const eth = injected();
  if (!eth) throw new Error("No browser wallet found. Install Rabby or MetaMask.");
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!address || address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`Switch your wallet to the agent's owner ${owner.slice(0, 6)}…${owner.slice(-4)}`);
  }
  return { address, signature: (await eth.request({ method: "personal_sign", params: [message, address] })) as Hex };
}

/** A readable message for wallet errors (EIP-1193 errors are plain objects, not Error instances). */
export function walletError(e: unknown): string {
  const err = e as { code?: number; shortMessage?: string; message?: string; details?: string; cause?: { code?: number } };
  const code = err?.code ?? err?.cause?.code;
  if (code === 4001) return "Request cancelled in your wallet.";
  if (code === -32002) return "Your wallet already has a request open. Check the wallet window.";
  const text = err?.shortMessage ?? err?.details ?? err?.message;
  return typeof text === "string" && text ? text.slice(0, 200) : typeof e === "string" ? e : "Your wallet returned an error. Try again.";
}
