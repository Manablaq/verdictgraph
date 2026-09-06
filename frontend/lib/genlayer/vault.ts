"use client";

import { createPublicClient, createWalletClient, custom, http } from "viem";
import { testnetBradbury } from "genlayer-js/chains";
import { BRADBURY_RPC, getEthereumProvider, getVaultAddress, readCore, type HexAddress, type TxHash } from "./client";

export const vaultAbi = [
  { type: "function", name: "handoff_status", stateMutability: "view", inputs: [{ name: "handoffId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "claimable", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "fund_handoff", stateMutability: "payable", inputs: [{ name: "handoffId", type: "uint256" }], outputs: [] },
  { type: "function", name: "post_bond", stateMutability: "payable", inputs: [{ name: "handoffId", type: "uint256" }], outputs: [] },
  { type: "function", name: "recover_unactivated", stateMutability: "nonpayable", inputs: [{ name: "handoffId", type: "uint256" }], outputs: [] },
  { type: "function", name: "recover_active", stateMutability: "nonpayable", inputs: [{ name: "handoffId", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

const publicClient = createPublicClient({ chain: testnetBradbury as never, transport: http(BRADBURY_RPC) });

export const escrowStatusLabels = ["NONE", "REGISTERED", "FUNDED", "ACTIVE", "SETTLED", "RECOVERED"] as const;

async function verifiedVaultAddress(): Promise<HexAddress> {
  const configured = getVaultAddress();
  if (!configured) throw new Error("VerdictGraph Vault address is not configured");
  const bound = await readCore<string>("get_vault_address");
  if (!bound || bound.toLowerCase() !== configured.toLowerCase()) {
    throw new Error("Frontend Vault address does not match the Vault bound in finalized Core state");
  }
  return configured;
}

export async function readVaultStatus(handoffId: bigint) {
  if (!getVaultAddress()) return null;
  const address = await verifiedVaultAddress();
  const value = await publicClient.readContract({ address, abi: vaultAbi, functionName: "handoff_status", args: [handoffId] });
  const index = Number(value);
  return { code: index, label: escrowStatusLabels[index] ?? "UNKNOWN" };
}

export async function readClaimable(account: HexAddress) {
  if (!getVaultAddress()) return 0n;
  const address = await verifiedVaultAddress();
  return await publicClient.readContract({ address, abi: vaultAbi, functionName: "claimable", args: [account] });
}

export async function waitForVaultReceipt(hash: TxHash) {
  return await publicClient.waitForTransactionReceipt({ hash });
}

export async function writeVault(
  account: HexAddress,
  functionName: "fund_handoff" | "post_bond" | "recover_unactivated" | "recover_active" | "withdraw",
  args: readonly bigint[] = [],
  value = 0n,
): Promise<TxHash> {
  const address = await verifiedVaultAddress();
  const provider = getEthereumProvider();
  if (!provider) throw new Error("No injected wallet provider found");
  const wallet = createWalletClient({ account, chain: testnetBradbury as never, transport: custom(provider as never) });
  return await wallet.writeContract({ address, abi: vaultAbi, functionName, args: args as never, value, account, chain: testnetBradbury as never } as never) as TxHash;
}
