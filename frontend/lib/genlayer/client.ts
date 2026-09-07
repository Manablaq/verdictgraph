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
export type ContractArgs = CalldataEncodable[];

interface EthereumProvider {
  request(args: {
    method: string;
    params?: unknown[];
  }): Promise<unknown>;

  on?(
    event: string,
    listener: (...args: unknown[]) => void,
  ): void;

  removeListener?(
    event: string,
    listener: (...args: unknown[]) => void,
  ): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export const BRADBURY_RPC =
  "https://rpc-bradbury.genlayer.com";

export const BRADBURY_EXPLORER =
  "https://explorer-bradbury.genlayer.com";

export const BRADBURY_CHAIN_ID = 4221;

export const VERDICTGRAPH_REGISTRY_ADDRESS =
  "0xCb031FbCEb219079608740fb77BC636F9447E7f5" as HexAddress;

export const VERDICTGRAPH_ADJUDICATOR_ADDRESS =
  "0x1B6d96aEc7A80ab582Afd9cb1eC182F197502868" as HexAddress;

export const VERDICTGRAPH_VAULT_ADDRESS =
  "0x9B6459aE8045cC4afa0bef0A9868DB46369a70C2" as HexAddress;

function exactAddress(
  configured: string | undefined,
  expected: HexAddress,
): HexAddress | null {
  const value = configured?.trim();

  if (!value) {
    return expected;
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return null;
  }

  return value.toLowerCase() === expected.toLowerCase()
    ? expected
    : null;
}

export function getRegistryAddress():
  HexAddress | null {
  return exactAddress(
    process.env
      .NEXT_PUBLIC_VERDICTGRAPH_REGISTRY_ADDRESS,
    VERDICTGRAPH_REGISTRY_ADDRESS,
  );
}

export function getAdjudicatorAddress():
  HexAddress | null {
  return exactAddress(
    process.env
      .NEXT_PUBLIC_VERDICTGRAPH_ADJUDICATOR_ADDRESS,
    VERDICTGRAPH_ADJUDICATOR_ADDRESS,
  );
}

export function getVaultAddress():
  HexAddress | null {
  return exactAddress(
    process.env
      .NEXT_PUBLIC_VERDICTGRAPH_VAULT_ADDRESS,
    VERDICTGRAPH_VAULT_ADDRESS,
  );
}

export function isProtocolConfigured(): boolean {
  return Boolean(
    getRegistryAddress() &&
    getAdjudicatorAddress() &&
    getVaultAddress()
  );
}

export function getEthereumProvider():
  EthereumProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.ethereum ?? null;
}

export const readClient = createClient({
  chain: testnetBradbury,
});

export function createWriteClient(
  account: HexAddress,
) {
  const provider = getEthereumProvider();

  if (!provider) {
    throw new Error(
      "No injected wallet provider found",
    );
  }

  return createClient({
    chain: testnetBradbury,
    account,
    provider,
  });
}

export async function connectWallet():
  Promise<HexAddress> {
  const provider = getEthereumProvider();

  if (!provider) {
    throw new Error(
      "No injected wallet provider found",
    );
  }

  const accounts = (
    await provider.request({
      method: "eth_requestAccounts",
    })
  ) as string[];

  if (
    !accounts?.[0] ||
    !/^0x[a-fA-F0-9]{40}$/.test(accounts[0])
  ) {
    throw new Error(
      "Wallet did not return a valid account",
    );
  }

  const account = accounts[0] as HexAddress;

  const client = createWriteClient(account);

  await client.connect("testnetBradbury");

  return account;
}

async function readAt<T>(
  label: string,
  address: HexAddress | null,
  functionName: string,
  args: ContractArgs = [],
  stateStatus:
    | "accepted"
    | "finalized" = "finalized",
): Promise<T> {
  if (!address) {
    throw new Error(
      `VerdictGraph ${label} address is missing or does not match the audited Bradbury deployment`,
    );
  }

  return (
    await readClient.readContract({
      address,
      functionName,
      args,
      transactionHashVariant:
        stateStatus === "finalized"
          ? TransactionHashVariant.LATEST_FINAL
          : TransactionHashVariant.LATEST_NONFINAL,
    })
  ) as T;
}

export async function readRegistry<T>(
  functionName: string,
  args: ContractArgs = [],
  stateStatus:
    | "accepted"
    | "finalized" = "finalized",
): Promise<T> {
  return readAt<T>(
    "Registry",
    getRegistryAddress(),
    functionName,
    args,
    stateStatus,
  );
}

export async function readAdjudicator<T>(
  functionName: string,
  args: ContractArgs = [],
  stateStatus:
    | "accepted"
    | "finalized" = "finalized",
): Promise<T> {
  return readAt<T>(
    "Adjudicator",
    getAdjudicatorAddress(),
    functionName,
    args,
    stateStatus,
  );
}

async function writeAt(
  account: HexAddress,
  label: string,
  address: HexAddress | null,
  functionName: string,
  args: ContractArgs = [],
): Promise<{
  hash: TxHash;
  acceptedReceipt: unknown;
}> {
  if (!address) {
    throw new Error(
      `VerdictGraph ${label} address is missing or does not match the audited Bradbury deployment`,
    );
  }

  const client = createWriteClient(account);

  const recommended =
    await client.estimateTransactionFeesForWrite({
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

  const acceptedReceipt =
    await readClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      fullTransaction: false,
    });

  if (
    acceptedReceipt.txExecutionResultName !==
    ExecutionResult.FINISHED_WITH_RETURN
  ) {
    throw new Error(
      `${label} consensus accepted the transaction, but execution result was ${acceptedReceipt.txExecutionResultName ?? "unknown"}`,
    );
  }

  return {
    hash,
    acceptedReceipt,
  };
}

export async function writeRegistry(
  account: HexAddress,
  functionName: string,
  args: ContractArgs = [],
) {
  return writeAt(
    account,
    "Registry",
    getRegistryAddress(),
    functionName,
    args,
  );
}

export async function writeAdjudicator(
  account: HexAddress,
  functionName: string,
  args: ContractArgs = [],
) {
  return writeAt(
    account,
    "Adjudicator",
    getAdjudicatorAddress(),
    functionName,
    args,
  );
}

export async function waitForFinalized(
  hash: TxHash,
) {
  const receipt =
    await readClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      fullTransaction: false,
    });

  return {
    receipt,
    executionSucceeded:
      receipt.txExecutionResultName ===
      ExecutionResult.FINISHED_WITH_RETURN,
  };
}

export function explorerTx(hash: string) {
  return `${BRADBURY_EXPLORER}/tx/${hash}`;
}

export function explorerAddress(address: string) {
  return `${BRADBURY_EXPLORER}/address/${address}`;
}
