"use client";

import { Wallet } from "lucide-react";
import { useWallet } from "@/lib/genlayer/wallet-context";
import { shortAddress } from "@/lib/format";

export function WalletButton() {
  const { account, connecting, error, connect } = useWallet();
  return (
    <div className="flex items-center gap-2">
      {error ? <span className="hidden text-xs text-rose-300 xl:inline">{error}</span> : null}
      <button
        onClick={() => void connect()}
        disabled={connecting}
        className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[.055] px-4 py-2 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[.08] disabled:opacity-60"
      >
        <Wallet size={15} />
        {connecting ? "Connecting…" : account ? shortAddress(account) : "Connect wallet"}
      </button>
    </div>
  );
}
