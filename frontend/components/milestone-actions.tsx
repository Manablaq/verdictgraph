"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, FileCheck2, Flag, Gavel, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";
import { formatGen } from "@/lib/format";
import { readMilestoneClaimable, readMilestoneVaultStatus, verifyMilestoneTopology, waitForMilestoneVaultReceipt, waitForMilestoneVaultStatus, writeMilestoneVault } from "@/lib/genlayer/milestone-vault";
import { BRADBURY_CHAIN_ID, friendlyGenLayerError, isTransactionFinalityPendingError, readMilestone, waitForFinalized, writeMilestone, type TxHash } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";
import type { MilestoneRecord } from "@/lib/types";
import { validateSubmission } from "@/lib/milestone-validation";
import { clearPendingGenLayerWrite, readPendingGenLayerWrite, savePendingGenLayerWrite, type PendingGenLayerWrite } from "@/lib/genlayer/pending";
import { StatusBadge } from "./status-badge";
import { PendingTransactionNotice } from "./pending-transaction-notice";

export function MilestoneActions({ milestoneId, milestone, allowedSubmissionOriginsJson }: { milestoneId: number; milestone: MilestoneRecord; allowedSubmissionOriginsJson: string }) {
  const { account, chainId, connect } = useWallet();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [submissionUri, setSubmissionUri] = useState(milestone.submission_uri || "");
  const [submissionSha, setSubmissionSha] = useState(milestone.submission_sha256 || "");
  const [challengeReason, setChallengeReason] = useState("");
  const pendingStorageKey = `verdictgraph:milestone:${milestoneId}:pending-genlayer-write`;
  const [pendingWrite, setPendingWrite] = useState<PendingGenLayerWrite | null>(() => readPendingGenLayerWrite(pendingStorageKey));
  const vault = useQuery({ queryKey: ["milestone-vault-status", milestoneId], queryFn: () => readMilestoneVaultStatus(BigInt(milestoneId)), enabled: true, refetchInterval: 15_000, refetchIntervalInBackground: false });
  const claimable = useQuery({ queryKey: ["milestone-claimable", account], queryFn: () => readMilestoneClaimable(account!), enabled: Boolean(account) });
  const vaultCode = vault.data?.code ?? -1;
  const isOwner = Boolean(account && account.toLowerCase() === milestone.owner.toLowerCase());
  const isBeneficiary = Boolean(account && account.toLowerCase() === milestone.beneficiary.toLowerCase());
  const isParticipant = isOwner || isBeneficiary;
  const wrongNetwork = Boolean(account && chainId !== BRADBURY_CHAIN_ID);
  const trustRootRepairRequired = Boolean(milestone.repair_failure_code && (/^BASELINE_/.test(milestone.repair_failure_code) || /^ACCEPTANCE_/.test(milestone.repair_failure_code)));
  const canSubmitEvidence = isBeneficiary && vaultCode === 3 && (milestone.status === "ACTIVE" || (milestone.status === "REPAIR_REQUIRED" && !trustRootRepairRequired));
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 1000));
    update();
    const timer = window.setInterval(update, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  async function ensureAccount() {
    if (account) return account;
    await connect();
    return null;
  }

  async function genlayer(action: string, functionName: string, args: unknown[], message: string) {
    const activeAccount = await ensureAccount();
    if (!activeAccount) return;
    setBusy(action);
    try {
      await verifyMilestoneTopology();
      const { hash } = await writeMilestone(activeAccount, functionName, args as never);
      const nextPending: PendingGenLayerWrite = { hash, label: message };
      setPendingWrite(nextPending);
      savePendingGenLayerWrite(pendingStorageKey, nextPending);
      let final;
      try {
        final = await waitForFinalized(hash);
      } catch (error) {
        if (isTransactionFinalityPendingError(error)) return;
        throw error;
      }
      setPendingWrite(null);
      clearPendingGenLayerWrite(pendingStorageKey);
      if (!final.executionSucceeded) throw new Error("Finalized Milestone transaction did not finish with return");
      if (functionName === "resolve_milestone" || functionName === "resolve_challenge" || functionName === "retry_milestone_review") {
        toast.success("Review request finalized. The GenLayer Adjudicator is processing the evidence; refresh shortly.");
      }
      const expectedVaultStatus = functionName === "register_milestone_in_vault" ? 1 : functionName === "queue_settlement" ? 4 : null;
      if (expectedVaultStatus !== null) {
        const downstream = await waitForMilestoneVaultStatus(BigInt(milestoneId), expectedVaultStatus);
        if (!downstream.reached) {
          toast.message(`GenLayer finalized. Vault is still ${downstream.label}; refresh this page to check settlement.`);
          return;
        }
      }
      toast.success("Milestone state finalized");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-vault-status", milestoneId] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-submission", milestoneId] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-review", milestone.latest_review_id.toString()] }),
      ]);
    } catch (error) { toast.error(friendlyGenLayerError(error, "Milestone transaction failed.")); }
    finally { setBusy(null); }
  }

  async function recheckPendingWrite() {
    if (!pendingWrite) return;
    setBusy("pending-finality");
    try {
      const final = await waitForFinalized(pendingWrite.hash as TxHash);
      setPendingWrite(null);
      clearPendingGenLayerWrite(pendingStorageKey);
      if (!final.executionSucceeded) throw new Error("Finalized Milestone transaction did not finish with return");
      toast.success("Previously accepted transaction is now finalized");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-vault-status", milestoneId] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-submission", milestoneId] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-review", milestone.latest_review_id.toString()] }),
      ]);
    } catch (error) {
      if (!isTransactionFinalityPendingError(error)) {
        toast.error(friendlyGenLayerError(error, "Could not confirm transaction finality."));
      }
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!pendingWrite || busy) return;
    const timer = window.setTimeout(() => {
      void recheckPendingWrite();
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [pendingWrite, busy]);

  async function evm(action: "fund_milestone" | "post_bond" | "recover_unactivated" | "recover_active" | "withdraw", value = 0n, args: readonly bigint[] = [BigInt(milestoneId)]) {
    const activeAccount = await ensureAccount();
    if (!activeAccount) return;
    setBusy(action);
    try {
      const hash = await writeMilestoneVault(activeAccount, action, args, value);
      await waitForMilestoneVaultReceipt(hash);
      toast.success(action === "fund_milestone" ? "Milestone principal funded" : action === "post_bond" ? "Beneficiary bond posted" : action === "withdraw" ? "Claimable GEN withdrawn" : "Milestone escrow recovered");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-vault-status", milestoneId] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-claimable", account] }),
      ]);
    } catch (error) { toast.error(friendlyGenLayerError(error, "Milestone Vault transaction failed.")); }
    finally { setBusy(null); }
  }

  async function submitMilestone() {
    const errors = validateSubmission(submissionUri, submissionSha, allowedSubmissionOriginsJson);
    if (errors.length) {
      toast.error(errors.join(" "));
      return;
    }
    await genlayer("submit", "submit_milestone", [BigInt(milestoneId), submissionUri.trim(), submissionSha.trim()], "Submission accepted.");
  }

  async function challengeMilestone() {
    if (!challengeReason.trim() || challengeReason.trim().length > 2_000) {
      toast.error("Challenge reason must be between 1 and 2,000 characters.");
      return;
    }
    await genlayer("challenge", "challenge_milestone", [BigInt(milestoneId), challengeReason.trim()], "Challenge accepted.");
  }

  const readyLabel = isOwner && !milestone.sponsor_ready ? "Mark sponsor ready" : isBeneficiary && !milestone.beneficiary_ready ? "Mark beneficiary ready" : null;
  const readinessComplete = milestone.sponsor_ready && milestone.beneficiary_ready;
  const submissionDeadlinePassed = now >= Number(milestone.submission_deadline);
  const canRunReview = milestone.status === "SUBMITTED" && Boolean(account) && (readinessComplete || submissionDeadlinePassed);
  return <section className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><Flag size={17} className="text-sky-300" /><span className="text-sm font-medium">Execution controls</span><StatusBadge value={vault.data?.label ?? (vault.isLoading ? "CHECKING" : "UNAVAILABLE")} /></div><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">Each action is gated by the on-chain milestone state. Subjective review stays inside GenLayer; the Vault only receives finalized exact outcomes.</p></div><button type="button" aria-label="Refresh milestone Vault state" onClick={() => void vault.refetch()} className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-400"><RefreshCw size={13}/> Refresh</button></div>
    {vault.isError ? <div className="mt-5 rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-4 text-xs leading-5 text-rose-200" role="alert">The live milestone Vault state could not be verified. Actions remain hidden until the audited topology and escrow status can be read.</div> : null}
    {wrongNetwork ? <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4 text-xs leading-5 text-amber-100/80" role="alert">Your wallet is connected on another network. Switch back to GenLayer Bradbury (chain {BRADBURY_CHAIN_ID}) before approving a milestone action.</div> : null}
    {pendingWrite ? <PendingTransactionNotice label={pendingWrite.label} hash={pendingWrite.hash} busy={busy === "pending-finality"} onRecheck={() => void recheckPendingWrite()} /> : null}
    {!pendingWrite && milestone.status === "REVIEW_PENDING" ? <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4 text-xs leading-5 text-amber-100/80" role="status"><div className="font-medium text-amber-100">{milestone.review_queued ? "Adjudicator review is still in progress." : "The Registry is waiting for the Adjudicator callback."}</div><p className="mt-1">Review request <span className="font-mono">#{milestone.review_request_id.toString()}</span> is recorded on the finalized Registry. The parent transaction only dispatches the review; the Adjudicator review and its callback are separate finalized transactions. Retry only when the downstream review has completed without updating this milestone; signing repeatedly while it is processing creates duplicate reviews.</p></div> : null}
    {!pendingWrite && vaultCode === 0 && !isOwner ? <div className="mt-5 rounded-2xl border border-sky-300/15 bg-sky-300/[.04] p-4 text-xs leading-5 text-sky-100/80">The escrow is not registered yet. Connect the sponsor wallet to activate the milestone and register its exact Vault terms.</div> : null}
    <div className="mt-6 flex flex-wrap gap-2">
      {!pendingWrite && milestone.status === "DRAFT" && isOwner ? <Action onClick={() => void genlayer("activate", "activate_milestone", [BigInt(milestoneId)], "Activation accepted.")} busy={busy === "activate"} disabled={wrongNetwork} icon={LockKeyhole}>Activate milestone</Action> : null}
      {!pendingWrite && milestone.status === "ACTIVE" && isOwner && vaultCode === 0 ? <Action onClick={() => void genlayer("register", "register_milestone_in_vault", [BigInt(milestoneId)], "Escrow registration accepted.")} busy={busy === "register"} disabled={wrongNetwork} icon={LockKeyhole}>Register escrow</Action> : null}
      {vaultCode === 1 && isOwner ? <Action onClick={() => void evm("fund_milestone", milestone.principal_required)} busy={busy === "fund_milestone"} disabled={wrongNetwork} icon={CircleDollarSign}>Fund {formatGen(milestone.principal_required)}</Action> : null}
      {vaultCode === 2 && isBeneficiary ? <Action onClick={() => void evm("post_bond", milestone.beneficiary_bond_required)} busy={busy === "post_bond"} disabled={wrongNetwork} icon={ShieldCheck}>Post bond {formatGen(milestone.beneficiary_bond_required)}</Action> : null}
      {vaultCode === 1 && account && now > Number(milestone.funding_deadline) ? <Action onClick={() => void evm("recover_unactivated")} busy={busy === "recover_unactivated"} disabled={wrongNetwork} icon={RefreshCw}>Recover unfunded escrow</Action> : null}
      {vaultCode === 2 && account && now > Number(milestone.funding_deadline) ? <Action onClick={() => void evm("recover_unactivated")} busy={busy === "recover_unactivated"} disabled={wrongNetwork} icon={RefreshCw}>Recover principal</Action> : null}
      {canSubmitEvidence ? <Action onClick={() => void submitMilestone()} busy={busy === "submit"} disabled={wrongNetwork} icon={FileCheck2}>Submit milestone</Action> : null}
      {readyLabel && milestone.status === "SUBMITTED" ? <Action onClick={() => void genlayer("ready", "mark_milestone_ready", [BigInt(milestoneId)], "Readiness accepted.")} busy={busy === "ready"} disabled={wrongNetwork} icon={ShieldCheck}>{readyLabel}</Action> : null}
      {canRunReview ? <Action onClick={() => void genlayer("resolve", "resolve_milestone", [BigInt(milestoneId)], "GenLayer review accepted.")} busy={busy === "resolve"} disabled={wrongNetwork} icon={Gavel}>Run GenLayer review</Action> : null}
      {milestone.status === "CHALLENGED" && isParticipant ? <Action onClick={() => void genlayer("resolve-challenge", "resolve_challenge", [BigInt(milestoneId)], "Challenge review accepted.")} busy={busy === "resolve-challenge"} disabled={wrongNetwork} icon={Gavel}>Resolve challenge</Action> : null}
      {milestone.status === "REVIEW_PENDING" && isParticipant ? <Action onClick={() => void genlayer("retry-review", "retry_milestone_review", [BigInt(milestoneId)], "Review delivery retry requested.")} busy={busy === "retry-review"} disabled={wrongNetwork} icon={RefreshCw}>Retry stalled review</Action> : null}
      {milestone.status === "REVIEWED" && isParticipant && now <= Number(milestone.challenge_deadline) && Number(milestone.challenge_count) < 2 ? <Action onClick={() => void challengeMilestone()} busy={busy === "challenge"} disabled={wrongNetwork || !challengeReason.trim()} icon={Flag}>Challenge verdict</Action> : null}
      {milestone.status === "REVIEWED" && account && vaultCode === 3 && (milestone.settlement_queued || now > Number(milestone.settlement_earliest_at)) ? <Action onClick={() => void genlayer("queue", "queue_settlement", [BigInt(milestoneId), milestone.latest_review_id], "Settlement message accepted.")} busy={busy === "queue"} disabled={wrongNetwork} icon={CircleDollarSign}>Queue exact settlement</Action> : null}
      {account && now > Number(milestone.recovery_deadline) && vaultCode === 3 ? <Action onClick={() => void evm("recover_active")} busy={busy === "recover_active"} disabled={wrongNetwork} icon={RefreshCw}>Recover expired escrow</Action> : null}
      {account && claimable.data && claimable.data > 0n ? <Action onClick={() => void evm("withdraw", 0n, [])} busy={busy === "withdraw"} disabled={wrongNetwork} icon={CircleDollarSign}>Withdraw {formatGen(claimable.data)}</Action> : null}
    </div>
    {canSubmitEvidence ? <div className="mt-6"><div className="grid gap-3 md:grid-cols-2"><Input label="Submission HTTPS URI" value={submissionUri} onChange={setSubmissionUri} placeholder="https://…"/><Input label="Submission SHA-256" value={submissionSha} onChange={setSubmissionSha} placeholder="64 lowercase hex characters"/></div><p className="mt-3 break-all text-[11px] leading-5 text-zinc-600">Authority-registered evidence origins: <span className="font-mono text-zinc-500">{allowedSubmissionOriginsJson}</span></p></div> : null}
    {milestone.status === "REVIEWED" && isParticipant && now <= Number(milestone.challenge_deadline) && Number(milestone.challenge_count) < 2 ? <div className="mt-6"><Input label="Challenge reason (required before clicking Challenge verdict)" value={challengeReason} onChange={setChallengeReason} placeholder="Identify the exact evidence or criterion you challenge."/></div> : null}
    {milestone.repair_failure_code ? <div className="mt-6 rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-4 text-xs leading-5 text-rose-200"><div>Repair required: <span className="font-mono">{milestone.repair_failure_code}</span></div>{milestone.repair_failure_code === "BASELINE_ALL_SOURCES_FAILED" ? <p className="mt-2 leading-5 text-rose-100/80">The registered baseline could not be decoded as reviewable UTF-8 text. Resubmitting evidence cannot repair this immutable trust root; register a replacement text-safe accepted project before creating a new milestone.</p> : null}{milestone.repair_observed_sha256 ? <span className="mt-2 block break-all text-rose-200/60">Observed digest {milestone.repair_observed_sha256}</span> : null}</div> : null}
  </section>;
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20" /></label>; }
function Action({ children, onClick, busy, disabled = false, icon: Icon }: { children: ReactNode; onClick: () => void; busy: boolean; disabled?: boolean; icon: ComponentType<{ size?: number; className?: string }> }) { return <button type="button" aria-busy={busy} disabled={busy || disabled} onClick={onClick} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin"/> : <Icon size={14}/>} {children}</button>; }
