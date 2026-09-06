"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { connectWallet, getEthereumProvider, type HexAddress } from "./client";

type WalletState = {
  account: HexAddress | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<HexAddress | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = getEthereumProvider();
    if (!provider) return;
    provider
      .request({ method: "eth_accounts" })
      .then((value) => {
        const accounts = value as string[];
        if (accounts?.[0] && /^0x[a-fA-F0-9]{40}$/.test(accounts[0])) {
          setAccount(accounts[0] as HexAddress);
        }
      })
      .catch(() => undefined);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      setAccount(await connectWallet());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const value = useMemo(() => ({ account, connecting, error, connect }), [account, connecting, error, connect]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
