"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  hexToBytes,
  http,
} from "viem";
import { testnetBradbury } from "genlayer-js/chains";
import {
  BRADBURY_RPC,
  assertBradburyNetwork,
  getEthereumProvider,
  getMilestoneAdjudicatorAddress,
  getMilestoneAdjudicatorSourceSha256,
  getMilestoneAuthorityAddress,
  getMilestoneAuthoritySourceSha256,
  getMilestoneRegistryAddress,
  getMilestoneRegistrySourceSha256,
  getMilestoneVaultAddress,
  getMilestoneVaultRuntimeSha256,
  isMilestoneConfigured,
  readMilestoneAdjudicator,
  readMilestoneAuthority,
  readMilestoneRegistry,
  type HexAddress,
  type TxHash,
} from "./client";

function configuredVaultAddress(): HexAddress | null {
  return getMilestoneVaultAddress();
}

export const milestoneVaultAbi = [
  { type: "function", name: "milestone_core", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "milestones", stateMutability: "view", inputs: [{ name: "milestoneId", type: "uint256" }], outputs: [{ name: "owner", type: "address" }, { name: "beneficiary", type: "address" }, { name: "principalRequired", type: "uint256" }, { name: "beneficiaryBondRequired", type: "uint256" }, { name: "fundingDeadline", type: "uint256" }, { name: "recoveryDeadline", type: "uint256" }, { name: "termsSha256", type: "string" }, { name: "status", type: "uint8" }] },
  { type: "function", name: "milestone_status", stateMutability: "view", inputs: [{ name: "milestoneId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "claimable", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "fund_milestone", stateMutability: "payable", inputs: [{ name: "milestoneId", type: "uint256" }], outputs: [] },
  { type: "function", name: "post_bond", stateMutability: "payable", inputs: [{ name: "milestoneId", type: "uint256" }], outputs: [] },
  { type: "function", name: "recover_unactivated", stateMutability: "nonpayable", inputs: [{ name: "milestoneId", type: "uint256" }], outputs: [] },
  { type: "function", name: "recover_active", stateMutability: "nonpayable", inputs: [{ name: "milestoneId", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

const publicClient = createPublicClient({
  chain: testnetBradbury as never,
  transport: http(BRADBURY_RPC),
});

export const milestoneEscrowStatusLabels = [
  "NONE",
  "REGISTERED",
  "FUNDED",
  "ACTIVE",
  "SETTLED",
  "RECOVERED",
] as const;

export type MilestoneVaultEscrow = {
  owner: HexAddress;
  beneficiary: HexAddress;
  principalRequired: bigint;
  beneficiaryBondRequired: bigint;
  fundingDeadline: bigint;
  recoveryDeadline: bigint;
  termsSha256: string;
  status: number;
};

export type MilestoneVaultSnapshot = {
  code: number;
  label: string;
  escrow: MilestoneVaultEscrow;
  blockNumber: bigint;
  blockHash: string;
};

// The deterministic Vault intentionally reverts when a milestone has not
// been registered yet. That is a valid pre-escrow state for a newly-created
// Registry milestone, not a topology or RPC failure.
const UNKNOWN_MILESTONE_ERROR_SELECTOR = "0xd4c95b05";

function isUnknownMilestoneError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(UNKNOWN_MILESTONE_ERROR_SELECTOR) || /UnknownMilestone/i.test(message);
}

export async function verifyMilestoneTopology() {
  const authority = getMilestoneAuthorityAddress();
  const registry = getMilestoneRegistryAddress();
  const adjudicator = getMilestoneAdjudicatorAddress();
  const vault = configuredVaultAddress();
  const expectedRuntimeSha256 = getMilestoneVaultRuntimeSha256();
  const authoritySourceSha256 = getMilestoneAuthoritySourceSha256();
  const registrySourceSha256 = getMilestoneRegistrySourceSha256();
  const adjudicatorSourceSha256 = getMilestoneAdjudicatorSourceSha256();
  if (!isMilestoneConfigured() || !authority || !registry || !adjudicator || !vault || !expectedRuntimeSha256 || !authoritySourceSha256 || !registrySourceSha256 || !adjudicatorSourceSha256) {
    throw new Error("Milestone deployment identity is not configured");
  }

  const [registryVault, registryAdjudicator, registryAuthority, adjudicatorRegistry, vaultController, bytecode, acceptanceAuthority, onChainAuthoritySourceSha256, onChainRegistrySourceSha256, onChainAdjudicatorSourceSha256] = await Promise.all([
    readMilestoneRegistry<string>("get_vault_address"),
    readMilestoneRegistry<string>("get_adjudicator_address"),
    readMilestoneRegistry<string>("get_authority_address"),
    readMilestoneAdjudicator<string>("registry_address"),
    publicClient.readContract({
      address: vault,
      abi: milestoneVaultAbi,
      functionName: "milestone_core",
    }),
    publicClient.getBytecode({ address: vault }),
    readMilestoneAuthority<string>("get_acceptance_authority"),
    readMilestoneAuthority<string>("get_authority_source_sha256"),
    readMilestoneRegistry<string>("get_registry_source_sha256"),
    readMilestoneAdjudicator<string>("get_adjudicator_source_sha256"),
  ]);
  if (String(registryVault).toLowerCase() !== vault.toLowerCase()) {
    throw new Error("Milestone Registry Vault binding does not match configured deployment");
  }
  if (String(registryAdjudicator).toLowerCase() !== adjudicator.toLowerCase()) {
    throw new Error("Milestone Registry Adjudicator binding does not match configured deployment");
  }
  if (String(registryAuthority).toLowerCase() !== authority.toLowerCase()) {
    throw new Error("Milestone Registry Authority binding does not match configured deployment");
  }
  if (String(adjudicatorRegistry).toLowerCase() !== registry.toLowerCase()) {
    throw new Error("Milestone Adjudicator Registry binding does not match configured deployment");
  }
  if (String(vaultController).toLowerCase() !== registry.toLowerCase()) {
    throw new Error("Milestone Vault Registry binding does not match configured deployment");
  }
  if (!acceptanceAuthority || /^0x0{40}$/i.test(String(acceptanceAuthority))) {
    throw new Error("Milestone Authority acceptance authority is not configured");
  }
  if (String(onChainAuthoritySourceSha256).toLowerCase() !== authoritySourceSha256.toLowerCase()) {
    throw new Error("Milestone Authority source digest does not match the published deployment identity");
  }
  if (String(onChainRegistrySourceSha256).toLowerCase() !== registrySourceSha256.toLowerCase()) {
    throw new Error("Milestone Registry source digest does not match the published deployment identity");
  }
  if (String(onChainAdjudicatorSourceSha256).toLowerCase() !== adjudicatorSourceSha256.toLowerCase()) {
    throw new Error("Milestone Adjudicator source digest does not match the published deployment identity");
  }
  if (!bytecode) {
    throw new Error("Milestone Vault has no deployed runtime bytecode");
  }
  const bytecodeBytes = new Uint8Array(hexToBytes(bytecode));
  const digest = await crypto.subtle.digest("SHA-256", bytecodeBytes.buffer as ArrayBuffer);
  const runtimeSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (runtimeSha256 !== expectedRuntimeSha256) {
    throw new Error("Milestone Vault runtime bytecode does not match the published deployment identity");
  }
  return {
    authority,
    registry,
    adjudicator,
    vault,
    controller: registry,
    registryVault: String(registryVault),
    controllerVault: String(vaultController),
    vaultController: String(vaultController),
    adjudicatorRegistry: String(adjudicatorRegistry),
    authorityAcceptanceAuthority: String(acceptanceAuthority),
    acceptanceAuthority: String(acceptanceAuthority),
    runtimeSha256,
    authoritySourceSha256: String(onChainAuthoritySourceSha256),
    registrySourceSha256: String(onChainRegistrySourceSha256),
    adjudicatorSourceSha256: String(onChainAdjudicatorSourceSha256),
    controllerSourceSha256: String(onChainRegistrySourceSha256),
  };
}

export async function readMilestoneVaultStatus(milestoneId: bigint) {
  const address = configuredVaultAddress();
  if (!address) return null;
  await verifyMilestoneTopology();
  let value: bigint;
  try {
    value = await publicClient.readContract({
      address,
      abi: milestoneVaultAbi,
      functionName: "milestone_status",
      args: [milestoneId],
    });
  } catch (error) {
    if (isUnknownMilestoneError(error)) return { code: 0, label: milestoneEscrowStatusLabels[0] };
    throw error;
  }
  const code = Number(value);
  return { code, label: milestoneEscrowStatusLabels[code] ?? "UNKNOWN" };
}

export async function readMilestoneVaultEscrow(milestoneId: bigint): Promise<MilestoneVaultEscrow> {
  const address = (await verifyMilestoneTopology()).vault;
  const value = await publicClient.readContract({
    address,
    abi: milestoneVaultAbi,
    functionName: "milestones",
    args: [milestoneId],
  });
  const [owner, beneficiary, principalRequired, beneficiaryBondRequired, fundingDeadline, recoveryDeadline, termsSha256, status] = value as readonly [HexAddress, HexAddress, bigint, bigint, bigint, bigint, string, number];
  return { owner, beneficiary, principalRequired, beneficiaryBondRequired, fundingDeadline, recoveryDeadline, termsSha256, status: Number(status) };
}

export async function readMilestoneVaultSnapshot(milestoneId: bigint): Promise<MilestoneVaultSnapshot> {
  const address = (await verifyMilestoneTopology()).vault;
  const block = await publicClient.getBlock();
  if (!block.hash) throw new Error("Bradbury did not return a hash for the anchored EVM block");
  const value = await publicClient.readContract({
    address,
    abi: milestoneVaultAbi,
    functionName: "milestones",
    args: [milestoneId],
    blockNumber: block.number,
  });
  const [owner, beneficiary, principalRequired, beneficiaryBondRequired, fundingDeadline, recoveryDeadline, termsSha256, status] = value as readonly [HexAddress, HexAddress, bigint, bigint, bigint, bigint, string, number];
  const escrow = { owner, beneficiary, principalRequired, beneficiaryBondRequired, fundingDeadline, recoveryDeadline, termsSha256, status: Number(status) };
  return { code: escrow.status, label: milestoneEscrowStatusLabels[escrow.status] ?? "UNKNOWN", escrow, blockNumber: block.number, blockHash: block.hash };
}

export async function writeMilestoneVault(
  account: HexAddress,
  functionName: "fund_milestone" | "post_bond" | "recover_unactivated" | "recover_active" | "withdraw",
  args: readonly bigint[] = [],
  value = 0n,
): Promise<TxHash> {
  const address = (await verifyMilestoneTopology()).vault;
  const provider = getEthereumProvider();
  if (!provider) throw new Error("No injected wallet provider found");
  await assertBradburyNetwork();
  const wallet = createWalletClient({ account, chain: testnetBradbury as never, transport: custom(provider as never) });
  return await wallet.writeContract({
    address,
    abi: milestoneVaultAbi,
    functionName,
    args: args as never,
    value,
    account,
    chain: testnetBradbury as never,
  } as never) as TxHash;
}

export async function readMilestoneClaimable(account: HexAddress) {
  const address = (await verifyMilestoneTopology()).vault;
  return await publicClient.readContract({
    address,
    abi: milestoneVaultAbi,
    functionName: "claimable",
    args: [account],
  });
}

export async function waitForMilestoneVaultReceipt(hash: TxHash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Milestone Vault transaction ${hash} reverted on Bradbury`);
  }
  return receipt;
}

export async function waitForMilestoneVaultStatus(
  milestoneId: bigint,
  expectedCode: number,
  timeoutMs = 180_000,
) {
  const startedAt = Date.now();
  let latest = await readMilestoneVaultStatus(milestoneId);
  while (latest && latest.code !== expectedCode && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2_000));
    latest = await readMilestoneVaultStatus(milestoneId);
  }
  if (!latest || latest.code !== expectedCode) {
    return {
      code: latest?.code ?? -1,
      label: latest?.label ?? "UNAVAILABLE",
      reached: false as const,
    };
  }
  return { ...latest, reached: true as const };
}
