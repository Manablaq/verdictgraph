"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Gavel, LoaderCircle, RefreshCcw, RotateCcw, Send, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { explorerTx, getVaultAddress, waitForFinalized, writeCore, type CoreArgs } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";
import { readVaultStatus } from "@/lib/genlayer/vault";
import { asNumber } from "@/lib/format";
import type { CaseRecord, EvidencePolicyRecord, HandoffRecord, RevisionRecord } from "@/lib/types";

export function CaseActions({
  caseId,
  caseRecord,
  handoff,
  revision,
  policy,
  stateStatus,
}: {
  caseId: number;
  caseRecord: CaseRecord;
  handoff: HandoffRecord;
  revision: RevisionRecord;
  policy: EvidencePolicyRecord;
  stateStatus: "accepted" | "finalized";
}) {
  const { account, connect } = useWallet();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const vaultConfigured = Boolean(getVaultAddress());
  const vaultStatus = useQuery({
    queryKey: ["vault-status", Number(caseRecord.handoff_id)],
    queryFn: () => readVaultStatus(caseRecord.handoff_id),
    enabled: vaultConfigured,
  });
  const now = Math.floor(Date.now() / 1000);
  const participant = account
    ? [handoff.requester, handoff.provider].some((value) => value.toLowerCase() === account.toLowerCase())
    : false;
  const isRequester = Boolean(account && handoff.requester.toLowerCase() === account.toLowerCase());
  const readyAlready = isRequester ? revision.requester_ready : revision.provider_ready;
  const evidenceReady =
    asNumber(revision.distinct_issuer_count) >= asNumber(policy.minimum_distinct_issuers) &&
    asNumber(revision.distinct_publisher_count) >= asNumber(policy.minimum_distinct_publishers);
  const responseWindowClosed = now >= asNumber(caseRecord.response_deadline);
  const bothReady = revision.requester_ready && revision.provider_ready;
  const reviewMayRun = caseRecord.status === "OPEN" && evidenceReady && (responseWindowClosed || bothReady);
  const settlementWindowClosed = now >= asNumber(caseRecord.settlement_earliest_at);
  const recoveryExpired = now > asNumber(caseRecord.recovery_deadline);
  const repairExpired = asNumber(caseRecord.repair_deadline) > 0 && now > asNumber(caseRecord.repair_deadline);

  async function getAccount() {
    if (account) return account;
    await connect();
    return null;
  }

  async function run(name: string, functionName: string, args: CoreArgs, finality = false) {
    const activeAccount = await getAccount();
    if (!activeAccount) return;
    setBusy(name);
    try {
      const { hash } = await writeCore(activeAccount, functionName, args);
      if (finality) {
        toast.message("Accepted by consensus; waiting for finalization…");
        const result = await waitForFinalized(hash);
        if (!result.executionSucceeded) throw new Error("Finalized transaction did not finish with return");
        toast.success("Finalized successfully", { action: { label: "Explorer", onClick: () => window.open(explorerTx(hash), "_blank") } });
      } else {
        toast.success("Transaction accepted", { action: { label: "Explorer", onClick: () => window.open(explorerTx(hash), "_blank") } });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["case", caseId] }),
        queryClient.invalidateQueries({
          queryKey: ["vault-status", Number(caseRecord.handoff_id)],
        }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transaction failed");
    } finally {
      setBusy(null);
    }
  }

  async function startEvidenceRepair() {
    const activeAccount = await getAccount();
    if (!activeAccount) return;
    setBusy("repair-revision");
    try {
      await writeCore(activeAccount, "begin_revision", [BigInt(caseId), "", ""]);
      toast.success("Repair revision opened; valid corroborators were carried forward");
      await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      const failed = asNumber(revision.failed_evidence_id);
      router.push(`/cases/${caseId}/evidence?state=accepted${failed > 0 ? `&repairEvidenceId=${failed}` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open repair revision");
    } finally {
      setBusy(null);
    }
  }

  async function retryTransientFailure() {
    await run("retry", "retry_current_revision", [BigInt(caseId)]);
  }

  const transientRepair = ["FETCH_FAILED", "RESPONSE_FETCH_FAILED", "DELIVERY_FETCH_FAILED"].includes(revision.failure_code);
  const deliveryRepair = revision.failure_code.startsWith("DELIVERY_");
  const evidenceRepair = asNumber(revision.failed_evidence_id) > 0;

  const acceptedSuffix = stateStatus === "accepted" ? "?state=accepted" : "";

  return (
    <div className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="text-xs uppercase tracking-[.17em] text-zinc-600">Case controls</div>
          <h3 className="mt-1 font-medium">Current revision actions</h3>
          <p className="mt-2 max-w-xl text-xs leading-5 text-zinc-600">
            Review is provisional until the transaction finalizes. EVM settlement is a separate finality-only message and can only be queued for the latest reviewed revision.
          </p>
        </div>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ["case", caseId] })} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-600 hover:text-zinc-200" title="Refresh case">
          <RefreshCcw size={14} />
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {caseRecord.status === "OPEN" && participant && !readyAlready ? (
          <Action busy={busy === "ready"} icon={CheckCircle2} onClick={() => run("ready", "mark_revision_ready", [BigInt(caseId)])}>
            Mark my side ready
          </Action>
        ) : null}

        {caseRecord.status === "OPEN" ? (
          <Link href={`/cases/${caseId}/evidence${acceptedSuffix}`} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs text-zinc-200">
            <ShieldAlert size={14} /> Register evidence
          </Link>
        ) : null}

        {caseRecord.status === "OPEN" && participant && !revision.response_author ? (
          <Link href={`/cases/${caseId}/respond${acceptedSuffix}`} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs text-zinc-200">
            <Send size={14} /> Submit response
          </Link>
        ) : null}

        {caseRecord.status === "OPEN" ? (
          <Action busy={busy === "review"} icon={Gavel} disabled={!reviewMayRun} onClick={() => run("review", "resolve_case", [BigInt(caseId)])}>
            Run GenLayer review
          </Action>
        ) : null}

        {caseRecord.status === "REVIEWED" && participant && !caseRecord.settlement_queued && !recoveryExpired ? (
          <Link href={`/cases/${caseId}/respond${acceptedSuffix}`} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs text-zinc-200">
            <RotateCcw size={14} /> Counter-evidence revision
          </Link>
        ) : null}

        {caseRecord.status === "REPAIR_REQUIRED" && participant && transientRepair && !recoveryExpired ? (
          <Action busy={busy === "retry"} icon={RefreshCcw} onClick={retryTransientFailure}>
            Retry same revision
          </Action>
        ) : null}

        {caseRecord.status === "REPAIR_REQUIRED" && participant && evidenceRepair && !recoveryExpired ? (
          <Action busy={busy === "repair-revision"} icon={RotateCcw} onClick={startEvidenceRepair}>
            Start evidence repair
          </Action>
        ) : null}

        {caseRecord.status === "REPAIR_REQUIRED" && participant && revision.failure_code.startsWith("RESPONSE_") && !recoveryExpired ? (
          <Link href={`/cases/${caseId}/respond${acceptedSuffix}`} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs text-zinc-200">
            <RotateCcw size={14} /> Repair response
          </Link>
        ) : null}

        {caseRecord.status === "REPAIR_REQUIRED" && participant && deliveryRepair && account?.toLowerCase() === handoff.provider.toLowerCase() && !recoveryExpired ? (
          <Link href={`/cases/${caseId}/repair-delivery${acceptedSuffix}`} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs text-zinc-200">
            <RotateCcw size={14} /> Repair delivery
          </Link>
        ) : null}

        {caseRecord.status === "REVIEWED" && !caseRecord.settlement_queued && asNumber(caseRecord.latest_verdict_id) > 0 ? (
          <Action busy={busy === "settle"} icon={Gavel} disabled={!settlementWindowClosed || recoveryExpired} onClick={() => run("settle", "queue_settlement", [BigInt(caseId), caseRecord.latest_verdict_id], true)}>
            Queue finalized settlement
          </Action>
        ) : null}

        {caseRecord.status === "REVIEWED" && caseRecord.settlement_queued && participant && vaultStatus.data?.code === 3 && !recoveryExpired ? (
          <Action busy={busy === "retry-settle"} icon={RefreshCcw} onClick={() => run("retry-settle", "queue_settlement", [BigInt(caseId), caseRecord.latest_verdict_id], true)}>
            Retry finalized settlement
          </Action>
        ) : null}

        {caseRecord.settlement_queued && participant && (vaultStatus.data?.code === 4 || vaultStatus.data?.code === 5) && asNumber(caseRecord.vault_terminal_status) !== vaultStatus.data.code ? (
          <Action busy={busy === "sync-vault"} icon={RefreshCcw} onClick={() => run("sync-vault", "sync_case_vault_status", [BigInt(caseId)], true)}>
            Sync Vault terminal state
          </Action>
        ) : null}

        {((caseRecord.status === "OPEN" && recoveryExpired) || (caseRecord.status === "REPAIR_REQUIRED" && repairExpired) || (caseRecord.status === "REVIEWED" && recoveryExpired && !caseRecord.settlement_queued)) ? (
          <Action busy={busy === "recover"} icon={RotateCcw} onClick={() => run("recover", "recover_case", [BigInt(caseId)], true)}>
            Recover case neutrally
          </Action>
        ) : null}
      </div>

      {caseRecord.status === "OPEN" && !reviewMayRun ? (
        <div className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[.035] p-3 text-xs leading-5 text-amber-100/70">
          Review unlocks after the response deadline or when both participants mark ready, and only after the policy's issuer/publisher corroboration thresholds are met.
        </div>
      ) : null}
      {caseRecord.status === "REVIEWED" && !settlementWindowClosed ? (
        <div className="mt-4 rounded-xl border border-sky-300/10 bg-sky-300/[.035] p-3 text-xs leading-5 text-sky-100/70">
          A bounded post-review response window is still open. A participant may submit counter-evidence as a fresh revision before settlement can be queued.
        </div>
      ) : null}
      {caseRecord.status === "REVIEWED" && caseRecord.settlement_queued && vaultStatus.data?.code === 3 ? (
        <div className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[.035] p-3 text-xs leading-5 text-amber-100/70">
          Settlement is queued in Core but the Vault is still ACTIVE. If the finalized external message was underfunded or failed, either participant can submit the exact same idempotent settlement again before the recovery deadline.
        </div>
      ) : null}
      {caseRecord.status === "SETTLED" ? (
        <div className="mt-4 rounded-xl border border-emerald-300/10 bg-emerald-300/[.035] p-3 text-xs leading-5 text-emerald-100/70">
          Core and Vault are synchronized: this dispute is settled. Claimable balances are withdrawn from the deterministic Vault.
        </div>
      ) : null}
    </div>
  );
}

function Action({ children, onClick, busy, disabled = false, icon: Icon }: { children: React.ReactNode; onClick: () => void; busy: boolean; disabled?: boolean; icon: typeof Gavel }) {
  return (
    <button disabled={busy || disabled} onClick={onClick} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-35">
      {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Icon size={14} />} {children}
    </button>
  );
}
