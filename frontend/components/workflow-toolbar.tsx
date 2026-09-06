"use client";

import { Archive, GitBranch, LoaderCircle, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { waitForFinalized, writeCore } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";

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
      const { hash } = await writeCore(account, functionName, [BigInt(workflowId)]);
      toast.message(`${label} accepted; waiting for finalization…`);
      const finalized = await waitForFinalized(hash);
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

  if (status === "DRAFT") {
    return (
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
          disabled={Boolean(busy) || Boolean(account && !isOwner)}
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
    );
  }

  if (status === "ACTIVE" && deadlineExpired) {
    return (
      <button
        disabled={Boolean(busy) || Boolean(account && !isOwner)}
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
    );
  }

  return null;
}
