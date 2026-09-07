"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
} from "viem";
import { testnetBradbury } from "genlayer-js/chains";
import {
  BRADBURY_RPC,
  getAdjudicatorAddress,
  getEthereumProvider,
  getRegistryAddress,
  getVaultAddress,
  readAdjudicator,
  readRegistry,
  type HexAddress,
  type TxHash,
} from "./client";

export const vaultAbi = [
  {
    type: "function",
    name: "registry_core",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "", type: "address" },
    ],
  },
  {
    type: "function",
    name: "adjudicator_core",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "", type: "address" },
    ],
  },
  {
    type: "function",
    name: "handoff_status",
    stateMutability: "view",
    inputs: [
      {
        name: "handoffId",
        type: "uint256",
      },
    ],
    outputs: [
      { name: "", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "claimable",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
    ],
    outputs: [
      { name: "", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "fund_handoff",
    stateMutability: "payable",
    inputs: [
      {
        name: "handoffId",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "post_bond",
    stateMutability: "payable",
    inputs: [
      {
        name: "handoffId",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "recover_unactivated",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "handoffId",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "recover_active",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "handoffId",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

const publicClient =
  createPublicClient({
    chain: testnetBradbury as never,
    transport: http(BRADBURY_RPC),
  });

export const escrowStatusLabels = [
  "NONE",
  "REGISTERED",
  "FUNDED",
  "ACTIVE",
  "SETTLED",
  "RECOVERED",
] as const;

export async function verifyVaultTopology() {
  const vault = getVaultAddress();
  const registry = getRegistryAddress();
  const adjudicator = getAdjudicatorAddress();

  if (!vault || !registry || !adjudicator) {
    throw new Error(
      "VerdictGraph deployment addresses are missing or do not match the audited Bradbury topology",
    );
  }

  const [
    registryAdjudicator,
    adjudicatorRegistry,
    registryVault,
    adjudicatorVault,
    vaultRegistry,
    vaultAdjudicator,
  ] = await Promise.all([
    readRegistry<string>(
      "get_adjudicator_address",
    ),
    readAdjudicator<string>(
      "registry_address",
    ),
    readRegistry<string>(
      "get_vault_address",
    ),
    readAdjudicator<string>(
      "get_vault_address",
    ),
    publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "registry_core",
    }),
    publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "adjudicator_core",
    }),
  ]);

  if (
    registryAdjudicator.toLowerCase() !==
    adjudicator.toLowerCase()
  ) {
    throw new Error(
      "Registry finalized Adjudicator binding does not match the audited Adjudicator",
    );
  }

  if (
    adjudicatorRegistry.toLowerCase() !==
    registry.toLowerCase()
  ) {
    throw new Error(
      "Adjudicator immutable Registry binding does not match the audited Registry",
    );
  }

  if (
    registryVault.toLowerCase() !==
    vault.toLowerCase()
  ) {
    throw new Error(
      "Registry finalized Vault binding does not match the audited Vault",
    );
  }

  if (
    adjudicatorVault.toLowerCase() !==
    vault.toLowerCase()
  ) {
    throw new Error(
      "Adjudicator finalized Vault binding does not match the audited Vault",
    );
  }

  if (
    String(vaultRegistry).toLowerCase() !==
    registry.toLowerCase()
  ) {
    throw new Error(
      "Vault immutable Registry controller does not match the audited Registry",
    );
  }

  if (
    String(vaultAdjudicator).toLowerCase() !==
    adjudicator.toLowerCase()
  ) {
    throw new Error(
      "Vault immutable Adjudicator controller does not match the audited Adjudicator",
    );
  }

  return {
    registry,
    adjudicator,
    vault,
    registryAdjudicator,
    adjudicatorRegistry,
    registryVault,
    adjudicatorVault,
    vaultRegistry:
      String(vaultRegistry),
    vaultAdjudicator:
      String(vaultAdjudicator),
  };
}

async function verifiedVaultAddress():
  Promise<HexAddress> {
  return (
    await verifyVaultTopology()
  ).vault;
}

export async function readVaultStatus(
  handoffId: bigint,
) {
  if (!getVaultAddress()) {
    return null;
  }

  const address =
    await verifiedVaultAddress();

  const value =
    await publicClient.readContract({
      address,
      abi: vaultAbi,
      functionName: "handoff_status",
      args: [handoffId],
    });

  const index = Number(value);

  return {
    code: index,
    label:
      escrowStatusLabels[index] ??
      "UNKNOWN",
  };
}

export async function readClaimable(
  account: HexAddress,
) {
  if (!getVaultAddress()) {
    return 0n;
  }

  const address =
    await verifiedVaultAddress();

  return await publicClient.readContract({
    address,
    abi: vaultAbi,
    functionName: "claimable",
    args: [account],
  });
}

export async function waitForVaultReceipt(
  hash: TxHash,
) {
  return await publicClient
    .waitForTransactionReceipt({
      hash,
    });
}

export async function writeVault(
  account: HexAddress,
  functionName:
    | "fund_handoff"
    | "post_bond"
    | "recover_unactivated"
    | "recover_active"
    | "withdraw",
  args: readonly bigint[] = [],
  value = 0n,
): Promise<TxHash> {
  const address =
    await verifiedVaultAddress();

  const provider =
    getEthereumProvider();

  if (!provider) {
    throw new Error(
      "No injected wallet provider found",
    );
  }

  const wallet =
    createWalletClient({
      account,
      chain:
        testnetBradbury as never,
      transport:
        custom(provider as never),
    });

  return await wallet.writeContract({
    address,
    abi: vaultAbi,
    functionName,
    args: args as never,
    value,
    account,
    chain:
      testnetBradbury as never,
  } as never) as TxHash;
}
