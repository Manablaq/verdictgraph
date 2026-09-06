"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, LoaderCircle, Settings2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import {
  explorerAddress,
  getCoreAddress,
  getVaultAddress,
  readCore,
  waitForFinalized,
  writeCore,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";
import { shortAddress } from "@/lib/format";

const ZERO = "0x0000000000000000000000000000000000000000";

async function loadSetup() {
  const [owner, boundVault] = await Promise.all([
    readCore<string>("get_owner"),
    readCore<string>("get_vault_address"),
  ]);
  return { owner, boundVault };
}

export default function SetupPage() {
  const { account, connect } = useWallet();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const core = getCoreAddress();
  const configuredVault = getVaultAddress();
  const query = useQuery({
    queryKey: ["protocol-setup"],
    queryFn: loadSetup,
    enabled: Boolean(core),
  });

  const owner = query.data?.owner ?? "";
  const boundVault = query.data?.boundVault ?? ZERO;
  const isOwner = Boolean(account && owner && account.toLowerCase() === owner.toLowerCase());
  const isBound = boundVault.toLowerCase() !== ZERO;
  const envMatchesBound = Boolean(
    configuredVault && isBound && configuredVault.toLowerCase() === boundVault.toLowerCase(),
  );

  async function bindVault() {
    if (!configuredVault) {
      toast.error("NEXT_PUBLIC_VERDICTGRAPH_VAULT_ADDRESS is not configured");
      return;
    }
    if (!account) {
      await connect();
      return;
    }
    if (!isOwner) {
      toast.error("Only the deployed Core owner can bind the Vault");
      return;
    }
    setBusy(true);
    try {
      const { hash } = await writeCore(account, "bind_vault", [configuredVault]);
      toast.message("Vault binding accepted; waiting for finalization…");
      const final = await waitForFinalized(hash);
      if (!final.executionSucceeded) {
        throw new Error("Finalized Vault binding did not finish with return");
      }
      await queryClient.invalidateQueries({ queryKey: ["protocol-setup"] });
      toast.success("Core↔Vault binding finalized and verified");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vault binding failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[.2em] text-zinc-600">
          <Settings2 size={14} /> Deployment setup
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Verify the economic boundary.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
          VerdictGraph binds exactly one deterministic Vault to the deployed Core. The Core checks
          `Vault.core()` on-chain before accepting the binding; the frontend then refuses to operate
          against a different configured Vault address.
        </p>
      </div>

      {!core ? (
        <div className="mt-7"><ConfigurationRequired /></div>
      ) : query.isLoading ? (
        <div className="mt-8 text-sm text-zinc-600">Reading finalized deployment state…</div>
      ) : query.isError || !query.data ? (
        <div className="mt-8 rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-5 text-sm text-rose-200">
          Could not read finalized Core setup state.
        </div>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_.72fr]">
          <section className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6">
            <div className="text-xs uppercase tracking-[.17em] text-zinc-600">Finalized deployment</div>
            <dl className="mt-5 space-y-4 text-sm">
              <Row label="Core" value={core} link={explorerAddress(core)} />
              <Row label="Core owner" value={owner} />
              <Row label="Configured Vault" value={configuredVault ?? "Not configured"} link={configuredVault ? explorerAddress(configuredVault) : undefined} />
              <Row label="Bound Vault" value={isBound ? boundVault : "Not bound"} link={isBound ? explorerAddress(boundVault) : undefined} />
            </dl>

            {!isBound ? (
              <button
                disabled={busy || Boolean(account && !isOwner) || !configuredVault}
                onClick={() => void bindVault()}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {account ? (isOwner ? "Bind configured Vault" : "Core owner wallet required") : "Connect owner wallet"}
              </button>
            ) : null}
          </section>

          <aside className={`rounded-[28px] border p-6 ${envMatchesBound ? "border-emerald-300/15 bg-emerald-300/[.035]" : "border-amber-300/15 bg-amber-300/[.035]"}`}>
            {envMatchesBound ? <CheckCircle2 size={20} className="text-emerald-300" /> : <ShieldAlert size={20} className="text-amber-300" />}
            <h2 className="mt-5 font-medium">{envMatchesBound ? "Binding matches frontend" : "Configuration requires attention"}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              {envMatchesBound
                ? "The finalized Core binding and NEXT_PUBLIC_VERDICTGRAPH_VAULT_ADDRESS are identical."
                : isBound
                  ? "The finalized Core is already bound, but the frontend Vault environment address is missing or different. Do not fund or settle until they match."
                  : "Deploy VerdictGraphVault with this Core address, configure its address in the frontend, then bind it once from the Core owner wallet."}
            </p>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function Row({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex flex-col justify-between gap-1 border-b border-white/[.06] pb-3 sm:flex-row sm:items-center">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="flex items-center gap-2 font-mono text-xs text-zinc-300">
        <span title={value}>{value.startsWith("0x") ? shortAddress(value) : value}</span>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-zinc-600 hover:text-zinc-200" aria-label={`Open ${label} in explorer`}>
            <ExternalLink size={13} />
          </a>
        ) : null}
      </dd>
    </div>
  );
}
