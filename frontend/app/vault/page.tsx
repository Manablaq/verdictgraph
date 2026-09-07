"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, LoaderCircle, WalletCards } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import {
  getVaultAddress,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";
import { readClaimable, waitForVaultReceipt, writeVault } from "@/lib/genlayer/vault";
import { formatGen, shortAddress } from "@/lib/format";

export default function VaultPage() {
  const { account, connect } = useWallet();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const configured = Boolean(getVaultAddress());
  const claimable = useQuery({ queryKey: ["claimable", account], queryFn: () => readClaimable(account!), enabled: configured && Boolean(account) });

  async function withdraw() {
    if (!account) { await connect(); return; }
    setBusy(true);
    try {
      const hash = await writeVault(account, "withdraw");
      await waitForVaultReceipt(hash);
      toast.success("Claimable GEN withdrawn");
      await qc.invalidateQueries({ queryKey: ["claimable", account] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Withdrawal failed"); }
    finally { setBusy(false); }
  }

  return <AppShell>
    <div className="max-w-4xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Deterministic custody</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Vault.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">GenLayer decides the exact registered consequence. The EVM Vault performs the arithmetic and credits pull-based claimable balances only after finality.</p></div>
    {!configured ? <div className="mt-7"><ConfigurationRequired/></div> : <div className="mt-8 grid max-w-4xl gap-5 md:grid-cols-[1fr_.8fr]">
      <section className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><WalletCards size={20} className="text-emerald-300"/><div className="mt-5 text-xs uppercase tracking-[.16em] text-zinc-600">Connected account</div><div className="mt-2 font-mono text-sm text-zinc-300">{account ? shortAddress(account, 8) : "Not connected"}</div><div className="mt-7 text-xs text-zinc-600">Claimable balance</div><div className="mt-2 text-4xl font-semibold tracking-[-.04em]">{account ? (claimable.isLoading ? "…" : formatGen(claimable.data ?? 0n)) : "—"}</div><button disabled={busy || Boolean(account && (claimable.data ?? 0n) === 0n)} onClick={withdraw} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40">{busy ? <LoaderCircle size={15} className="animate-spin"/> : <CircleDollarSign size={15}/>} {account ? "Withdraw claimable GEN" : "Connect wallet"}</button></section>
      <aside className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><h2 className="font-medium">Custody invariants</h2><ul className="mt-5 space-y-3 text-sm leading-6 text-zinc-500"><li>Core never chooses an arbitrary amount.</li><li>Only the Core ghost/address can apply a verdict.</li><li>Policy fingerprint must match registered escrow terms.</li><li>Each case can settle at most once.</li><li>Expired unactivated and active escrows have permissionless recovery paths.</li><li>Withdrawals use checks-effects-interactions plus a reentrancy lock.</li></ul></aside>
    </div>}
  </AppShell>;
}
