"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BRADBURY_CHAIN_ID,
  clearActiveWallet,
  connectWallet,
  discoverWallets,
  type HexAddress,
  type WalletOption,
} from "./client";

type WalletState = {
  account: HexAddress | null;
  wallet: WalletOption | null;
  wallets: WalletOption[];
  chainId: number | null;

  selectorOpen: boolean;

  connectingWalletId:
    string | null;

  error: string | null;

  refreshWallets:
    () => Promise<void>;

  openWalletSelector:
    () => Promise<void>;

  closeWalletSelector:
    () => void;

  /*
   * No argument:
   *   open wallet selector.
   *
   * With walletId:
   *   explicitly connect
   *   the selected provider.
   */
  connect:
    (
      walletId?: string,
    ) => Promise<boolean>;

  disconnect:
    () => void;

  clearError:
    () => void;
};

const WalletContext =
  createContext<WalletState | null>(
    null,
  );

function validAddress(
  value: unknown,
): value is HexAddress {
  return (
    typeof value === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(
      value,
    )
  );
}

function parseChainId(
  value: unknown,
): number | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const parsed =
    Number.parseInt(
      value,
      16,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

export function WalletProvider({
  children,
}: {
  children:
    React.ReactNode;
}) {
  const [
    account,
    setAccount,
  ] =
    useState<HexAddress | null>(
      null,
    );

  const [
    wallet,
    setWallet,
  ] =
    useState<WalletOption | null>(
      null,
    );

  const [
    wallets,
    setWallets,
  ] =
    useState<WalletOption[]>([]);

  const [
    chainId,
    setChainId,
  ] =
    useState<number | null>(
      null,
    );

  const [
    selectorOpen,
    setSelectorOpen,
  ] =
    useState(false);

  const [
    connectingWalletId,
    setConnectingWalletId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const refreshWallets =
    useCallback(
      async () => {
        const discovered =
          await discoverWallets();

        setWallets(
          discovered,
        );
      },
      [],
    );

  /*
   * Discovery is safe.
   *
   * It does NOT request accounts,
   * does NOT choose a provider,
   * and does NOT trigger a wallet
   * permission popup.
   */
  useEffect(() => {
    void refreshWallets();
  }, [refreshWallets]);

  useEffect(() => {
    if (!wallet) {
      return;
    }

    const provider =
      wallet.provider;

    const onAccountsChanged =
      (...args: unknown[]) => {
        const accounts =
          Array.isArray(
            args[0],
          )
            ? args[0]
            : [];

        const next =
          accounts[0];

        if (
          !validAddress(
            next,
          )
        ) {
          clearActiveWallet();

          setAccount(null);
          setWallet(null);
          setChainId(null);
          setSelectorOpen(
            false,
          );

          return;
        }

        setAccount(next);
      };

    const onChainChanged =
      (...args: unknown[]) => {
        const next =
          parseChainId(
            args[0],
          );

        setChainId(next);

        if (
          next !== null &&
          next !==
            BRADBURY_CHAIN_ID
        ) {
          setError(
            "Wallet changed away from Bradbury. Switch back to Bradbury before sending a transaction.",
          );
        } else {
          setError(null);
        }
      };

    const onDisconnect =
      () => {
        clearActiveWallet();

        setAccount(null);
        setWallet(null);
        setChainId(null);
        setSelectorOpen(
          false,
        );
        setError(null);
      };

    provider.on?.(
      "accountsChanged",
      onAccountsChanged,
    );

    provider.on?.(
      "chainChanged",
      onChainChanged,
    );

    provider.on?.(
      "disconnect",
      onDisconnect,
    );

    return () => {
      provider.removeListener?.(
        "accountsChanged",
        onAccountsChanged,
      );

      provider.removeListener?.(
        "chainChanged",
        onChainChanged,
      );

      provider.removeListener?.(
        "disconnect",
        onDisconnect,
      );
    };
  }, [wallet]);

  const openWalletSelector =
    useCallback(
      async () => {
        setError(null);

        /*
         * Open immediately.
         * Wallet discovery may finish
         * a fraction later.
         */
        setSelectorOpen(true);

        await refreshWallets();
      },
      [refreshWallets],
    );

  const closeWalletSelector =
    useCallback(() => {
      if (
        connectingWalletId
      ) {
        return;
      }

      setSelectorOpen(false);
      setError(null);
    }, [
      connectingWalletId,
    ]);

  const connect =
    useCallback(
      async (
        walletId?: string,
      ): Promise<boolean> => {
        /*
         * Backwards-compatible app API:
         *
         * Existing action screens call
         * connect() when no account exists.
         *
         * That must OPEN THE CHOOSER,
         * not auto-select a wallet.
         */
        if (!walletId) {
          await openWalletSelector();

          return false;
        }

        const selected =
          wallets.find(
            (candidate) =>
              candidate.id ===
              walletId,
          );

        if (!selected) {
          setError(
            "Selected wallet is no longer available. Refresh the wallet list and choose again.",
          );

          setSelectorOpen(true);

          return false;
        }

        setConnectingWalletId(
          selected.id,
        );

        setError(null);

        try {
          const nextAccount =
            await connectWallet(
              selected,
            );

          const chainHex =
            await selected.provider
              .request({
                method:
                  "eth_chainId",
              });

          setWallet(selected);

          setAccount(
            nextAccount,
          );

          setChainId(
            parseChainId(
              chainHex,
            ),
          );

          setSelectorOpen(
            false,
          );

          return true;
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Wallet connection failed",
          );

          /*
           * Keep chooser visible
           * after an error so the
           * user can retry or choose
           * another wallet.
           */
          setSelectorOpen(true);

          return false;
        } finally {
          setConnectingWalletId(
            null,
          );
        }
      },
      [
        wallets,
        openWalletSelector,
      ],
    );

  const disconnect =
    useCallback(() => {
      /*
       * EIP-1193 has no universal
       * cross-wallet permission
       * revocation method.
       *
       * This disconnect removes the
       * provider/account from the
       * VerdictGraph application
       * session.
       */
      clearActiveWallet();

      setAccount(null);
      setWallet(null);
      setChainId(null);

      setSelectorOpen(
        false,
      );

      setConnectingWalletId(
        null,
      );

      setError(null);
    }, []);

  const clearError =
    useCallback(() => {
      setError(null);
    }, []);

  const value =
    useMemo(
      () => ({
        account,
        wallet,
        wallets,
        chainId,

        selectorOpen,

        connectingWalletId,

        error,

        refreshWallets,
        openWalletSelector,
        closeWalletSelector,
        connect,
        disconnect,
        clearError,
      }),
      [
        account,
        wallet,
        wallets,
        chainId,

        selectorOpen,

        connectingWalletId,

        error,

        refreshWallets,
        openWalletSelector,
        closeWalletSelector,
        connect,
        disconnect,
        clearError,
      ],
    );

  return (
    <WalletContext.Provider
      value={value}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const value =
    useContext(
      WalletContext,
    );

  if (!value) {
    throw new Error(
      "useWallet must be used inside WalletProvider",
    );
  }

  return value;
}
