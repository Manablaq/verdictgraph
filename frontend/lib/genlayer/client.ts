"use client";

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import {
  ExecutionResult,
  TransactionHashVariant,
  TransactionStatus,
  type CalldataEncodable,
  type TransactionHash,
} from "genlayer-js/types";

export type HexAddress = `0x${string}`;
export type TxHash = TransactionHash;
export type CoreArgs = CalldataEncodable[];

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export const BRADBURY_RPC = "https://rpc-bradbury.genlayer.com";
export const BRADBURY_EXPLORER = "https://explorer-bradbury.genlayer.com";
export const BRADBURY_CHAIN_ID = 4221;

export function getCoreAddress(): HexAddress | null {
  const value = process.env.NEXT_PUBLIC_VERDICTGRAPH_CORE_ADDRESS?.trim();
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as HexAddress) : null;
}

export function getVaultAddress(): HexAddress | null {
  const value = process.env.NEXT_PUBLIC_VERDICTGRAPH_VAULT_ADDRESS?.trim();
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as HexAddress) : null;
}

export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export const readClient = createClient({ chain: testnetBradbury });

export function createWriteClient(account: HexAddress) {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("No injected wallet provider found");
  return createClient({
    chain: testnetBradbury,
    account,
    provider,
  });
}

export async function connectWallet(): Promise<HexAddress> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("No injected wallet provider found");
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0] || !/^0x[a-fA-F0-9]{40}$/.test(accounts[0])) {
    throw new Error("Wallet did not return a valid account");
  }
  const account = accounts[0] as HexAddress;
  const client = createWriteClient(account);
  await client.connect("testnetBradbury");
  return account;
}

export async function readCore<T>(
  functionName: string,
  args: CoreArgs = [],
  stateStatus: "accepted" | "finalized" = "finalized",
): Promise<T> {
  const address = getCoreAddress();
  if (!address) throw new Error("VerdictGraph Core address is not configured");
  return (await readClient.readContract({
    address,
    functionName,
    args,
    transactionHashVariant:
      stateStatus === "finalized"
        ? TransactionHashVariant.LATEST_FINAL
        : TransactionHashVariant.LATEST_NONFINAL,
  })) as T;
}

export async function writeCore(
  account: HexAddress,
  functionName: string,
  args: CoreArgs = [],
): Promise<{ hash: TxHash; acceptedReceipt: unknown }> {
  const address = getCoreAddress();
  if (!address) throw new Error("VerdictGraph Core address is not configured");
  const client = createWriteClient(account);

  // Current Bradbury fee policy requires a concrete budget for GenVM execution
  // and any child messages (including finality-only Core -> EVM Vault calls).
  // Use the SDK's simulation-backed estimator; never fall back to guessed fees.
  const recommended = await client.estimateTransactionFeesForWrite({
    address,
    functionName,
    args,
    value: 0n,
  });

  const hash = await client.writeContract({
    address,
    functionName,
    args,
    value: 0n,
    fees: {
      distribution: recommended.distribution,
      messageAllocations: recommended.messageAllocations,
      feeValue: recommended.feeValue,
    },
  });
  const acceptedReceipt = await readClient.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    fullTransaction: false,
  });
  if (acceptedReceipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
    throw new Error(
      `Consensus accepted the transaction, but execution result was ${acceptedReceipt.txExecutionResultName ?? "unknown"}`,
    );
  }
  return { hash, acceptedReceipt };
}

export async function waitForFinalized(hash: TxHash) {
  const receipt = await readClient.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    fullTransaction: false,
  });
  return {
    receipt,
    executionSucceeded:
      receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN,
  };
}

export function explorerTx(hash: string) {
  return `${BRADBURY_EXPLORER}/tx/${hash}`;
}

export function explorerAddress(address: string) {
  return `${BRADBURY_EXPLORER}/address/${address}`;
}
