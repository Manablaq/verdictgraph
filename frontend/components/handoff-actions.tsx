"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleDollarSign,
  FileCheck2,
  FileWarning,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  type ContractArgs,
  getVaultAddress,
  writeRegistry,
  waitForFinalized,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";
import {
  readVaultStatus,
  waitForVaultReceipt,
  writeVault,
} from "@/lib/genlayer/vault";
import { formatGen, shortAddress } from "@/lib/format";
import type { HandoffRecord } from "@/lib/types";
import { StatusBadge } from "./status-badge";

export function HandoffActions({
  workflowId,
  handoffId,
  handoff,
  caseId,
  workflowOwner,
}: {
  workflowId: number;
  handoffId: number;
  handoff: HandoffRecord;
  caseId: number;
  workflowOwner: string;
}) {
  const { account, connect } = useWallet();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const vaultConfigured = Boolean(getVaultAddress());
  const vaultStatus = useQuery({
    queryKey: ["vault-status", handoffId],
    queryFn: () => readVaultStatus(BigInt(handoffId)),
    enabled: vaultConfigured,
  });

  const now = Math.floor(Date.now() / 1000);
  const fundingExpired = now > Number(handoff.funding_deadline);
  const recoveryExpired = now > Number(handoff.recovery_deadline);
  const isRequester = Boolean(
    account && handoff.requester.toLowerCase() === account.toLowerCase(),
  );
  const isProvider = Boolean(
    account && handoff.provider.toLowerCase() === account.toLowerCase(),
  );
  const isParticipant = isRequester || isProvider;
  const completionQueued =
    handoff.completion_queued && Number(handoff.delivery_accepted_at) > 0;

  async function ensureAccount() {
    if (account) return account;
    await connect();
    return null;
  }

  async function runRegistryFinality(
    busyKey: string,
    functionName: string,
    args: ContractArgs,
    acceptedMessage: string,
    finalMessage: string,
  ) {
    const activeAccount = await ensureAccount();
    if (!activeAccount) return;
    setBusy(busyKey);
    try {
      const { hash } = await writeRegistry(activeAccount, functionName, args);
      toast.message(acceptedMessage);
      const final = await waitForFinalized(hash);
      if (!final.executionSucceeded) {
        throw new Error("Finalized Registry transaction did not finish with return");
      }
      toast.success(finalMessage);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vault-status", handoffId] }),
        queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registry transaction failed");
    } finally {
      setBusy(null);
    }
  }

  async function register() {
    await runRegistryFinality(
      "register",
      "register_handoff_in_vault",
      [BigInt(handoffId)],
      "Escrow registration accepted; waiting for finalization…",
      "Escrow terms finalized and registration message emitted",
    );
  }

  async function acceptDelivery() {
    await runRegistryFinality(
      "accept-delivery",
      "accept_handoff_delivery",
      [BigInt(handoffId)],
      "Delivery acceptance accepted; waiting for finality before Vault release…",
      "Delivery acceptance finalized; provider-release message emitted",
    );
  }

  async function retryCompletion() {
    await runRegistryFinality(
      "retry-completion",
      "retry_handoff_completion",
      [BigInt(handoffId)],
      "Completion retry accepted; waiting for finalization…",
      "A fresh idempotent Vault-release message was emitted",
    );
  }

  async function syncCompletion() {
    await runRegistryFinality(
      "sync-completion",
      "sync_handoff_vault_status",
      [BigInt(handoffId)],
      "Vault terminal-state sync accepted; waiting for finalization…",
      "Registry now records the terminal Vault state",
    );
  }

  async function evm(
    action:
      | "fund_handoff"
      | "post_bond"
      | "recover_unactivated"
      | "recover_active",
    value = 0n,
  ) {
    const activeAccount = await ensureAccount();
    if (!activeAccount) return;
    setBusy(action);
    try {
      const hash = await writeVault(
        activeAccount,
        action,
        [BigInt(handoffId)],
        value,
      );
      await waitForVaultReceipt(hash);
      const message =
        action === "fund_handoff"
          ? "Principal funded"
          : action === "post_bond"
            ? "Provider bond posted"
            : "Escrow recovered";
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["vault-status", handoffId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vault transaction failed");
    } finally {
      setBusy(null);
    }
  }

  const label =
    vaultStatus.data?.label ?? (vaultConfigured ? "LOADING" : "NO VAULT");

  return (
    <div className="rounded-[24px] border border-white/[.08] bg-white/[.02] p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Handoff #{handoffId}</span>
            <StatusBadge value={label} />
            {caseId ? <StatusBadge value={`CASE ${caseId}`} /> : null}
            {completionQueued ? <StatusBadge value="COMPLETION QUEUED" /> : null}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            {handoff.responsibility}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-700">
            <span>Requester {shortAddress(handoff.requester)}</span>
            <span>Provider {shortAddress(handoff.provider)}</span>
            <span>Principal {formatGen(handoff.principal_required)}</span>
            <span>Bond {formatGen(handoff.provider_bond_required)}</span>
            {handoff.delivery_sha256 ? (
              <span className="inline-flex items-center gap-1">
                <FileCheck2 size={12} /> Delivery {handoff.delivery_sha256.slice(0, 10)}…
              </span>
            ) : (
              <span>No delivery yet</span>
            )}
            {Number(handoff.completion_attempt_count) > 0 ? (
              <span>Release attempts {Number(handoff.completion_attempt_count)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!vaultConfigured ? (
            <span className="rounded-full border border-amber-300/15 px-3 py-2 text-xs text-amber-300">
              Vault address not configured
            </span>
          ) : vaultStatus.data?.code === 0 &&
            account?.toLowerCase() === workflowOwner.toLowerCase() ? (
            <Action onClick={register} busy={busy === "register"} icon={LockKeyhole}>
              Register escrow
            </Action>
          ) : vaultStatus.data?.code === 1 && !fundingExpired && isRequester ? (
            <Action
              onClick={() => evm("fund_handoff", handoff.principal_required)}
              busy={busy === "fund_handoff"}
              icon={CircleDollarSign}
            >
              Fund principal
            </Action>
          ) : vaultStatus.data?.code === 2 && !fundingExpired && isProvider ? (
            <Action
              onClick={() => evm("post_bond", handoff.provider_bond_required)}
              busy={busy === "post_bond"}
              icon={ShieldCheck}
            >
              Post bond
            </Action>
          ) : null}

          {vaultStatus.data?.code === 3 && completionQueued && isParticipant && !recoveryExpired ? (
            <Action
              onClick={retryCompletion}
              busy={busy === "retry-completion"}
              icon={RefreshCw}
            >
              Retry finalized release
            </Action>
          ) : null}

          {vaultStatus.data?.code === 3 && !completionQueued && !caseId && !recoveryExpired ? (
            <>
              {!handoff.delivery_uri && isProvider ? (
                <Link
                  href={`/workflows/${workflowId}/handoffs/${handoffId}/deliver`}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-black"
                >
                  <PackageCheck size={14} /> Submit delivery
                </Link>
              ) : null}
              {handoff.delivery_uri && isRequester ? (
                <Action
                  onClick={acceptDelivery}
                  busy={busy === "accept-delivery"}
                  icon={ShieldCheck}
                >
                  Accept delivery
                </Action>
              ) : null}
              <Link
                href={`/workflows/${workflowId}/handoffs/${handoffId}/open-case`}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300"
              >
                <FileWarning size={14} /> Open dispute
              </Link>
            </>
          ) : null}

          {(vaultStatus.data?.code === 4 || vaultStatus.data?.code === 5) &&
          completionQueued &&
          isParticipant &&
          Number(handoff.vault_terminal_status) !== vaultStatus.data.code ? (
            <Action
              onClick={syncCompletion}
              busy={busy === "sync-completion"}
              icon={RefreshCw}
            >
              Sync terminal state
            </Action>
          ) : null}

          {(vaultStatus.data?.code === 1 || vaultStatus.data?.code === 2) && fundingExpired ? (
            <Action
              onClick={() => evm("recover_unactivated")}
              busy={busy === "recover_unactivated"}
              icon={RotateCcw}
            >
              Recover expired escrow
            </Action>
          ) : null}

          {vaultStatus.data?.code === 3 && recoveryExpired ? (
            <Action
              onClick={() => evm("recover_active")}
              busy={busy === "recover_active"}
              icon={RotateCcw}
            >
              Neutral Vault recovery
            </Action>
          ) : null}

          <button
            onClick={() => vaultStatus.refetch()}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-zinc-600 hover:text-zinc-200"
            title="Refresh Vault state"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Action({
  children,
  onClick,
  busy,
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  icon: typeof LockKeyhole;
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-black disabled:opacity-50"
    >
      {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Icon size={14} />} {children}
    </button>
  );
}
