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

export function clearActiveWallet() {
  activeEthereumProvider = null;
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

const GENLAYER_SNAP_ID =
  "npm:genlayer-wallet-plugin";

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

async function ensureGenLayerSnap(
  provider: EthereumProvider,
) {
  let installed:
    Record<
      string,
      { id?: string }
    >;

  try {
    installed = (
      await provider.request({
        method:
          "wallet_getSnaps",
      })
    ) as Record<
      string,
      { id?: string }
    >;
  } catch (error) {
    throw new Error(
      "MetaMask is connected, but its Snaps API is unavailable. " +
      "Use a MetaMask version that supports Snaps. " +
      walletErrorMessage(error),
    );
  }

  const installedAlready =
    Object.values(
      installed ?? {},
    ).some(
      (snap) =>
        snap?.id ===
        GENLAYER_SNAP_ID,
    );

  if (installedAlready) {
    return;
  }

  try {
    await provider.request({
      method:
        "wallet_requestSnaps",
      params: {
        [GENLAYER_SNAP_ID]:
          {},
      },
    });
  } catch (error) {
    if (
      walletErrorCode(error) ===
      4001
    ) {
      throw new Error(
        "GenLayer Snap installation was rejected.",
      );
    }

    throw new Error(
      "Could not install the GenLayer wallet Snap. " +
      walletErrorMessage(error),
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

    /*
     * MetaMask follows GenLayer's
     * published Snap integration.
     *
     * Other EIP-1193 providers are
     * kept on the standard provider
     * signing path used by the pinned
     * GenLayer SDK transport.
     */
    if (wallet.isMetaMask) {
      await ensureGenLayerSnap(
        provider,
      );
    }

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
