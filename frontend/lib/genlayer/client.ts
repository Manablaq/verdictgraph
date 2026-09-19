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
    params?: unknown[] | Record<string, unknown>;
  }): Promise<unknown>;

  isMetaMask?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: EthereumProvider[];

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

export type WalletOption = {
  id: string;
  name: string;
  rdns: string;
  icon: string | null;
  provider: EthereumProvider;
  isMetaMask: boolean;
};

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: EthereumProvider;
};

let activeEthereumProvider:
  EthereumProvider | null = null;

export const BRADBURY_RPC =
  "https://rpc-bradbury.genlayer.com";

export const BRADBURY_EXPLORER =
  "https://explorer-bradbury.genlayer.com";

export const BRADBURY_CHAIN_ID = 4221;

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000";

export const VERDICTGRAPH_REGISTRY_ADDRESS =
  "0xCb031FbCEb219079608740fb77BC636F9447E7f5" as HexAddress;

export const VERDICTGRAPH_ADJUDICATOR_ADDRESS =
  "0x1B6d96aEc7A80ab582Afd9cb1eC182F197502868" as HexAddress;

export const VERDICTGRAPH_VAULT_ADDRESS =
  "0x9B6459aE8045cC4afa0bef0A9868DB46369a70C2" as HexAddress;

const MILESTONE_AUTHORITY_ADDRESS_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_AUTHORITY_ADDRESS;
const MILESTONE_REGISTRY_ADDRESS_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_REGISTRY_ADDRESS;
const MILESTONE_REGISTRY_ADDRESS_LEGACY_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_ADDRESS;
const MILESTONE_ADJUDICATOR_ADDRESS_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_ADJUDICATOR_ADDRESS;
const MILESTONE_VAULT_ADDRESS_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_VAULT_ADDRESS;
const MILESTONE_VAULT_RUNTIME_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_VAULT_RUNTIME_SHA256;
const MILESTONE_AUTHORITY_SOURCE_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_AUTHORITY_SOURCE_SHA256;
const MILESTONE_REGISTRY_SOURCE_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_REGISTRY_SOURCE_SHA256;
const MILESTONE_REGISTRY_SOURCE_LEGACY_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_SOURCE_SHA256;
const MILESTONE_ADJUDICATOR_SOURCE_ENV =
  process.env.NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_ADJUDICATOR_SOURCE_SHA256;

function configuredMilestoneAddress(
  ...values: (string | undefined)[]
): HexAddress | null {
  for (const candidate of values) {
    const value = candidate?.trim();
    if (value) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
        return null;
      }

      // A zero address is never a deployable VerdictGraph target. Treating it
      // as configured would let the GenLayer SDK encode a contract deployment
      // instead of a Registry call, which is irreversible and cannot create a
      // milestone.
      return value.toLowerCase() === ZERO_ADDRESS
        ? null
        : value as HexAddress;
    }
  }
  return null;
}

export function getMilestoneAuthorityAddress(): HexAddress | null {
  return configuredMilestoneAddress(MILESTONE_AUTHORITY_ADDRESS_ENV);
}

export function getMilestoneRegistryAddress(): HexAddress | null {
  return configuredMilestoneAddress(
    MILESTONE_REGISTRY_ADDRESS_ENV,
    MILESTONE_REGISTRY_ADDRESS_LEGACY_ENV,
  );
}

export function getMilestoneAdjudicatorAddress(): HexAddress | null {
  return configuredMilestoneAddress(MILESTONE_ADJUDICATOR_ADDRESS_ENV);
}

/** Compatibility alias: the split Registry replaces the old Controller. */
export function getMilestoneAddress(): HexAddress | null {
  return getMilestoneRegistryAddress();
}

export function getMilestoneVaultAddress(): HexAddress | null {
  return configuredMilestoneAddress(MILESTONE_VAULT_ADDRESS_ENV);
}

export function getMilestoneVaultRuntimeSha256(): string | null {
  const value = MILESTONE_VAULT_RUNTIME_ENV?.trim();
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

export function getMilestoneControllerSourceSha256(): string | null {
  return getMilestoneRegistrySourceSha256();
}

function configuredMilestoneSourceSha256(
  ...values: (string | undefined)[]
): string | null {
  for (const candidate of values) {
    const value = candidate?.trim();
    if (value) {
      return /^[0-9a-f]{64}$/.test(value) ? value : null;
    }
  }
  return null;
}

export function getMilestoneAuthoritySourceSha256(): string | null {
  return configuredMilestoneSourceSha256(MILESTONE_AUTHORITY_SOURCE_ENV);
}

export function getMilestoneRegistrySourceSha256(): string | null {
  return configuredMilestoneSourceSha256(
    MILESTONE_REGISTRY_SOURCE_ENV,
    MILESTONE_REGISTRY_SOURCE_LEGACY_ENV,
  );
}

export function getMilestoneAdjudicatorSourceSha256(): string | null {
  return configuredMilestoneSourceSha256(MILESTONE_ADJUDICATOR_SOURCE_ENV);
}

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

  if (value.toLowerCase() === ZERO_ADDRESS) {
    return null;
  }

  return value.toLowerCase() ===
    expected.toLowerCase()
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
    getVaultAddress(),
  );
}

export function isMilestoneConfigured(): boolean {
  return Boolean(
    getMilestoneAuthorityAddress() &&
    getMilestoneRegistryAddress() &&
    getMilestoneAdjudicatorAddress() &&
    getMilestoneVaultAddress() &&
    getMilestoneVaultRuntimeSha256() &&
    getMilestoneAuthoritySourceSha256() &&
    getMilestoneRegistrySourceSha256() &&
    getMilestoneAdjudicatorSourceSha256(),
  );
}

function trueMetaMask(
  provider: EthereumProvider,
): boolean {
  return Boolean(
    provider.isMetaMask &&
    !provider.isRabby &&
    !provider.isBraveWallet,
  );
}

function legacyIdentity(
  provider: EthereumProvider,
  index: number,
) {
  if (provider.isRabby) {
    return {
      name: "Rabby Wallet",
      rdns: "io.rabby",
    };
  }

  if (provider.isCoinbaseWallet) {
    return {
      name: "Coinbase Wallet",
      rdns: "com.coinbase.wallet",
    };
  }

  if (provider.isBraveWallet) {
    return {
      name: "Brave Wallet",
      rdns: "com.brave.wallet",
    };
  }

  if (trueMetaMask(provider)) {
    return {
      name: "MetaMask",
      rdns: "io.metamask",
    };
  }

  return {
    name:
      index === 0
        ? "Browser wallet"
        : `Browser wallet ${index + 1}`,
    rdns: `injected.${index}`,
  };
}

export async function discoverWallets():
  Promise<WalletOption[]> {
  if (typeof window === "undefined") {
    return [];
  }

  const wallets: WalletOption[] = [];
  const seen =
    new Set<EthereumProvider>();

  const add = (
    provider: EthereumProvider,
    info: {
      id: string;
      name: string;
      rdns: string;
      icon?: string | null;
    },
  ) => {
    if (seen.has(provider)) {
      return;
    }

    seen.add(provider);

    wallets.push({
      id: info.id,
      name: info.name,
      rdns: info.rdns,
      icon:
        info.icon?.startsWith("data:image/")
          ? info.icon
          : null,
      provider,
      isMetaMask:
        info.rdns.toLowerCase() ===
          "io.metamask" ||
        trueMetaMask(provider),
    });
  };

  const onProvider = (event: Event) => {
    const detail = (
      event as CustomEvent<Eip6963ProviderDetail>
    ).detail;

    if (
      !detail?.provider ||
      !detail?.info
    ) {
      return;
    }

    add(
      detail.provider,
      {
        id:
          detail.info.uuid ||
          detail.info.rdns,
        name:
          detail.info.name ||
          "Browser wallet",
        rdns:
          detail.info.rdns ||
          "injected",
        icon:
          detail.info.icon,
      },
    );
  };

  window.addEventListener(
    "eip6963:announceProvider",
    onProvider,
  );

  window.dispatchEvent(
    new Event("eip6963:requestProvider"),
  );

  await new Promise<void>(
    (resolve) =>
      window.setTimeout(resolve, 250),
  );

  window.removeEventListener(
    "eip6963:announceProvider",
    onProvider,
  );

  const root = window.ethereum;

  if (root) {
    const legacy =
      Array.isArray(root.providers) &&
      root.providers.length > 0
        ? root.providers
        : [root];

    legacy.forEach(
      (provider, index) => {
        const identity =
          legacyIdentity(
            provider,
            index,
          );

        add(
          provider,
          {
            id:
              `${identity.rdns}:legacy:${index}`,
            name:
              identity.name,
            rdns:
              identity.rdns,
            icon:
              null,
          },
        );
      },
    );
  }

  return wallets.sort(
    (a, b) => {
      if (a.isMetaMask !== b.isMetaMask) {
        return a.isMetaMask ? -1 : 1;
      }

      return a.name.localeCompare(
        b.name,
      );
    },
  );
}

export function getEthereumProvider():
  EthereumProvider | null {
  return activeEthereumProvider;
}

export async function assertBradburyNetwork(): Promise<void> {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error("No wallet is connected to VerdictGraph.");
  }
  const expected = `0x${BRADBURY_CHAIN_ID.toString(16)}`;
  const current = String(
    await provider.request({ method: "eth_chainId" }),
  ).toLowerCase();
  if (current !== expected) {
    throw new Error(
      `Wallet is on chain ${current}; switch to GenLayer Bradbury (chain ${BRADBURY_CHAIN_ID}) before signing.`,
    );
  }
}

export function clearActiveWallet() {
  activeEthereumProvider = null;
}

export async function restoreWalletConnection(
  wallet: WalletOption,
): Promise<HexAddress | null> {
  if (typeof window === "undefined") return null;

  const accounts = await wallet.provider.request({ method: "eth_accounts" });
  const candidate = Array.isArray(accounts) ? accounts[0] : null;
  if (typeof candidate !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(candidate)) {
    return null;
  }

  activeEthereumProvider = wallet.provider;
  return candidate as HexAddress;
}

export const readClient = createClient({
  chain: testnetBradbury,
});

export function createWriteClient(
  account: HexAddress,
) {
  const provider =
    getEthereumProvider();

  if (!provider) {
    throw new Error(
      "No wallet is connected to VerdictGraph.",
    );
  }

  return createClient({
    chain: testnetBradbury,
    account,
    provider,
  });
}

function walletErrorCode(
  error: unknown,
): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const value = (
      error as {
        code?: unknown;
      }
    ).code;

    if (
      typeof value === "number"
    ) {
      return value;
    }

    if (
      typeof value === "string" &&
      /^-?\d+$/.test(value)
    ) {
      return Number(value);
    }
  }

  return null;
}

function walletErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    const value = (
      error as {
        message?: unknown;
      }
    ).message;

    if (
      typeof value === "string" &&
      value
    ) {
      return value;
    }
  }

  return "Wallet connection failed";
}

async function ensureBradburyNetwork(
  provider: EthereumProvider,
) {
  const chainId =
    `0x${BRADBURY_CHAIN_ID.toString(16)}`;

  const current = String(
    await provider.request({
      method: "eth_chainId",
    }),
  ).toLowerCase();

  if (current === chainId) {
    return;
  }

  try {
    await provider.request({
      method:
        "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    const code =
      walletErrorCode(error);

    if (code === 4001) {
      throw new Error(
        "Bradbury network switch was rejected.",
      );
    }

    if (code !== 4902) {
      throw new Error(
        "This wallet could not switch to Bradbury. " +
        walletErrorMessage(error),
      );
    }

    await provider.request({
      method:
        "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName:
            testnetBradbury.name,
          rpcUrls: [
            BRADBURY_RPC,
          ],
          nativeCurrency:
            testnetBradbury
              .nativeCurrency,
          blockExplorerUrls: [
            BRADBURY_EXPLORER,
          ],
        },
      ],
    });

    await provider.request({
      method:
        "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }

  const verified = String(
    await provider.request({
      method: "eth_chainId",
    }),
  ).toLowerCase();

  if (verified !== chainId) {
    throw new Error(
      "Wallet did not switch to Bradbury.",
    );
  }
}

export async function connectWallet(
  wallet: WalletOption,
): Promise<HexAddress> {
  const provider =
    wallet.provider;

  try {
    const accounts = (
      await provider.request({
        method:
          "eth_requestAccounts",
      })
    ) as string[];

    const candidate =
      accounts?.[0];

    if (
      !candidate ||
      !/^0x[a-fA-F0-9]{40}$/.test(
        candidate,
      )
    ) {
      throw new Error(
        `${wallet.name} did not return a valid account.`,
      );
    }

    await ensureBradburyNetwork(
      provider,
    );

    // All supported injected wallets, including MetaMask, stay on the
    // standard EIP-1193 provider path. Bradbury network identity is verified
    // above; no wallet-specific Snap is required for normal signing.

    activeEthereumProvider =
      provider;

    return candidate as HexAddress;
  } catch (error) {
    activeEthereumProvider =
      null;

    throw new Error(
      walletErrorMessage(error),
    );
  }
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

  if (address.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(
      `VerdictGraph ${label} address is the zero address; refusing to use it as a contract target`,
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

export async function readMilestoneAuthority<T>(
  functionName: string,
  args: ContractArgs = [],
  stateStatus: "accepted" | "finalized" = "finalized",
): Promise<T> {
  return readAt<T>(
    "Milestone Authority",
    getMilestoneAuthorityAddress(),
    functionName,
    args,
    stateStatus,
  );
}

/**
 * An unregistered project is a valid first-run state for the authority UI.
 * GenLayer returns it as a finalized UserError, so callers that are probing
 * for an optional trust root must handle this exact condition explicitly.
 */
export function isUnknownAcceptedProjectError(error: unknown): boolean {
  // Bradbury currently normalizes GenLayer VM UserErrors from view calls to
  // "Missing or invalid parameters". The authority contract uses that path
  // for a project reference that has not been registered yet, so the form
  // must treat it as an empty registration target rather than render the raw
  // provider payload as a fatal inspection error.
  return error instanceof Error && (/unknown accepted project/i.test(error.message) || /missing or invalid parameters/i.test(error.message));
}

/** Keep provider VM payloads out of the UI while preserving actionable states. */
export function friendlyGenLayerError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (!message) return fallback;
  if (isUnknownAcceptedProjectError(error)) {
    return "That project reference is not registered in finalized GenLayer state.";
  }
  if (isTransactionFinalityPendingError(error) || /finality|awaiting Bradbury|timed? out|timeout/i.test(message)) {
    return "The transaction was accepted and is still awaiting Bradbury finality.";
  }
  if (/user rejected|user denied|rejected the request/i.test(message)) {
    return "The wallet approval was rejected.";
  }
  if (/insufficient funds|insufficient balance|not enough GEN/i.test(message)) {
    return "The connected wallet does not have enough GEN for this action.";
  }
  if (/network|fetch failed|failed to fetch|connection/i.test(message)) {
    return "The GenLayer read could not reach the network. Check the connection and retry.";
  }
  return fallback;
}

export async function readMilestoneRegistry<T>(
  functionName: string,
  args: ContractArgs = [],
  stateStatus: "accepted" | "finalized" = "finalized",
): Promise<T> {
  return readAt<T>(
    "Milestone Registry",
    getMilestoneRegistryAddress(),
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

export async function readMilestoneAdjudicator<T>(
  functionName: string,
  args: ContractArgs = [],
  stateStatus: "accepted" | "finalized" = "finalized",
): Promise<T> {
  return readAt<T>(
    "Milestone Adjudicator",
    getMilestoneAdjudicatorAddress(),
    functionName,
    args,
    stateStatus,
  );
}

export async function readMilestone<T>(
  functionName: string,
  args: ContractArgs = [],
  stateStatus: "accepted" | "finalized" = "finalized",
): Promise<T> {
  return readAt<T>(
    "Milestone Registry",
    getMilestoneRegistryAddress(),
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

  if (address.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(
      `VerdictGraph ${label} target is the zero address; refusing to submit a deployment transaction`,
    );
  }

  await assertBradburyNetwork();

  const client = createWriteClient(account);

  /*
   * Bradbury currently exposes the legacy native write path, while its
   * FeeManager address reverts on the newer optional policy reads used by
   * GenLayerJS's fee-estimation helper. The documented SDK write path keeps
   * the transaction fee distribution at the chain-native default and avoids
   * synthesizing a fee preset from an unavailable policy endpoint.
   */
  const hash = await client.writeContract({
    address,
    functionName,
    args,
    value: 0n,
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

export async function writeMilestoneAuthority(
  account: HexAddress,
  functionName: string,
  args: ContractArgs = [],
) {
  return writeAt(
    account,
    "Milestone Authority",
    getMilestoneAuthorityAddress(),
    functionName,
    args,
  );
}

export async function writeMilestoneRegistry(
  account: HexAddress,
  functionName: string,
  args: ContractArgs = [],
) {
  return writeAt(
    account,
    "Milestone Registry",
    getMilestoneRegistryAddress(),
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

export async function writeMilestone(
  account: HexAddress,
  functionName: string,
  args: ContractArgs = [],
) {
  return writeAt(
    account,
    "Milestone Registry",
    getMilestoneRegistryAddress(),
    functionName,
    args,
  );
}

export class TransactionFinalityPendingError extends Error {
  readonly hash: TxHash;

  constructor(hash: TxHash) {
    super("Transaction was accepted and is still awaiting Bradbury finality");
    this.name = "TransactionFinalityPendingError";
    this.hash = hash;
  }
}

function looksLikeFinalityTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timed?\s*out|timeout|deadline exceeded|finaliz(?:e|ation).*wait/i.test(message);
}

export function isTransactionFinalityPendingError(
  error: unknown,
): error is TransactionFinalityPendingError {
  return error instanceof TransactionFinalityPendingError;
}

export async function waitForFinalized(
  hash: TxHash,
  options: { timeoutMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 25_000;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const receipt = await Promise.race([
      readClient.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.FINALIZED,
        fullTransaction: false,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new TransactionFinalityPendingError(hash)),
          timeoutMs,
        );
      }),
    ]);

    return {
      receipt,
      executionSucceeded:
        receipt.txExecutionResultName ===
        ExecutionResult.FINISHED_WITH_RETURN,
    };
  } catch (error) {
    if (isTransactionFinalityPendingError(error) || looksLikeFinalityTimeout(error)) {
      throw new TransactionFinalityPendingError(hash);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function explorerTx(hash: string) {
  return `${BRADBURY_EXPLORER}/tx/${hash}`;
}

export function explorerAddress(address: string) {
  return `${BRADBURY_EXPLORER}/address/${address}`;
}
