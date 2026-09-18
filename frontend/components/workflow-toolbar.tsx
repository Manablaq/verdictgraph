"use client";

import { Archive, GitBranch, LoaderCircle, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  isTransactionFinalityPendingError,
  writeRegistry,
  waitForFinalized,
  type TxHash,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";
import { clearPendingGenLayerWrite, readPendingGenLayerWrite, savePendingGenLayerWrite, type PendingGenLayerWrite } from "@/lib/genlayer/pending";
import { PendingTransactionNotice } from "./pending-transaction-notice";

export function WorkflowToolbar({
  workflowId,
  status,
  owner,
  deadline,
}: {
  workflowId: number;
  status: string;
  owner: string;
  deadline: bigint;
}) {
  const { account, connect } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const pendingStorageKey = `verdictgraph:workflow:${workflowId}:pending-genlayer-write`;
  const [pendingFinality, setPendingFinality] = useState<PendingGenLayerWrite | null>(() => readPendingGenLayerWrite(pendingStorageKey));
  const isOwner = Boolean(account && account.toLowerCase() === owner.toLowerCase());
  const deadlineExpired = Math.floor(Date.now() / 1000) > Number(deadline);

  async function runFinal(functionName: string, label: string) {
    if (!account) {
      await connect();
      return;
    }
    if (!isOwner) {
      toast.error("Workflow owner wallet required");
      return;
    }
    setBusy(functionName);
    try {
      const { hash } = await writeRegistry(account, functionName, [BigInt(workflowId)]);
      const pending: PendingGenLayerWrite = { hash, label };
      setPendingFinality(pending);
      savePendingGenLayerWrite(pendingStorageKey, pending);
      toast.message(`${label} accepted; waiting for finalization…`);
      let finalized;
      try {
        finalized = await waitForFinalized(hash);
      } catch (error) {
        if (isTransactionFinalityPendingError(error)) return;
        throw error;
      }
      setPendingFinality(null);
      clearPendingGenLayerWrite(pendingStorageKey);
      if (!finalized.executionSucceeded) {
        throw new Error(`Finalized ${label.toLowerCase()} did not finish with return`);
      }
      toast.success(`${label} finalized`);
      window.location.assign(`/workflows/${workflowId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function recheckPendingFinality() {
    if (!pendingFinality) return;
    setBusy("pending-finality");
    try {
      const finalized = await waitForFinalized(pendingFinality.hash as TxHash);
      setPendingFinality(null);
      clearPendingGenLayerWrite(pendingStorageKey);
      if (!finalized.executionSucceeded) throw new Error("Finalized workflow transaction did not finish with return");
      toast.success("Previously accepted workflow transaction is now finalized");
      window.location.assign(`/workflows/${workflowId}`);
    } catch (error) {
      if (!isTransactionFinalityPendingError(error)) {
        toast.error(error instanceof Error ? error.message : "Could not confirm transaction finality");
      }
    } finally {
      setBusy(null);
    }
  }

  const pendingNotice = pendingFinality ? <PendingTransactionNotice label={pendingFinality.label} hash={pendingFinality.hash} busy={busy === "pending-finality"} onRecheck={() => void recheckPendingFinality()} /> : null;

  if (status === "DRAFT") {
    return (
      <div>
        {pendingNotice}
        <div className="flex flex-wrap gap-2">
        <Link
          href={`/workflows/${workflowId}/add-handoff`}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm"
        >
          <Plus size={15} /> Add handoff
        </Link>
        <Link
          href={`/workflows/${workflowId}/dependencies?state=accepted`}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm"
        >
          <GitBranch size={15} /> Dependencies
        </Link>
        <button
          type="button"
          aria-busy={busy === "activate_workflow"}
          disabled={Boolean(busy) || Boolean(pendingFinality) || Boolean(account && !isOwner)}
          onClick={() => void runFinal("activate_workflow", "Workflow activation")}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"
        >
          {busy === "activate_workflow" ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <Play size={15} />
          )}
          {account ? (isOwner ? "Activate workflow" : "Owner wallet required") : "Connect wallet"}
        </button>
        </div>
      </div>
    );
  }

  if (status === "ACTIVE" && deadlineExpired) {
    return (
      <div>
        {pendingNotice}
      <button
        type="button"
        aria-busy={busy === "close_workflow"}
        disabled={Boolean(busy) || Boolean(pendingFinality) || Boolean(account && !isOwner)}
          onClick={() => void runFinal("close_workflow", "Workflow closure")}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm disabled:opacity-40"
        >
          {busy === "close_workflow" ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <Archive size={15} />
          )}
          {account ? (isOwner ? "Close expired workflow" : "Owner wallet required") : "Connect wallet"}
        </button>
      </div>
    );
  }

  return null;
}
