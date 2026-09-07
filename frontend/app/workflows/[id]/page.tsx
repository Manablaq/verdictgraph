"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, CircleDollarSign, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowGraph, type GraphHandoff } from "@/components/workflow-graph";
import { WorkflowToolbar } from "@/components/workflow-toolbar";
import { HandoffActions } from "@/components/handoff-actions";
import { SnapshotNotice } from "@/components/snapshot-notice";
import {
  isProtocolConfigured,
  readRegistry,
} from "@/lib/genlayer/client";
import { asNumber, formatGen, formatUnix, shortAddress } from "@/lib/format";
import type { EvidencePolicyRecord, HandoffRecord, WorkflowRecord } from "@/lib/types";

async function loadWorkflow(id: number, stateStatus: "accepted" | "finalized") {
  const workflow = await readRegistry<WorkflowRecord>("get_workflow", [BigInt(id)], stateStatus);
  const policy = await readRegistry<EvidencePolicyRecord>("get_policy", [workflow.policy_id], stateStatus);
  const handoffs = await Promise.all(Array.from({ length: asNumber(workflow.handoff_count) }, async (_, index) => {
    const handoffId = asNumber(await readRegistry<bigint>("get_workflow_handoff", [BigInt(id), BigInt(index)], stateStatus));
    const handoff = await readRegistry<HandoffRecord>("get_handoff", [BigInt(handoffId)], stateStatus);
    const caseId = asNumber(await readRegistry<bigint>("get_handoff_case_id", [BigInt(handoffId)], stateStatus));
    const dependencies = await Promise.all(Array.from({ length: asNumber(handoff.dependency_count) }, (_, dependencyIndex) => readRegistry<bigint>("get_handoff_dependency", [BigInt(handoffId), BigInt(dependencyIndex)], stateStatus).then(asNumber)));
    return { id: handoffId, value: handoff, caseId, dependencies };
  }));
  return { workflow, policy, handoffs };
}

export default function WorkflowDetailPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-sm text-zinc-600">Loading workflow…</div></AppShell>}>
      <WorkflowDetailContent />
    </Suspense>
  );
}

function WorkflowDetailContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const stateStatus: "accepted" | "finalized" = search.get("state") === "accepted" ? "accepted" : "finalized";
  const id = Number(params.id);
  const configured = Boolean(isProtocolConfigured());
  const query = useQuery({ queryKey: ["workflow", id, stateStatus], queryFn: () => loadWorkflow(id, stateStatus), enabled: configured && Number.isInteger(id) && id > 0 });
  const data = query.data;
  const graph: GraphHandoff[] = data?.handoffs.map(({ id: handoffId, value, caseId, dependencies }) => ({ id: handoffId, requester: value.requester, provider: value.provider, responsibility: value.responsibility, dependencies, caseId: caseId || undefined })) ?? [];
  return (
    <AppShell>
      <Link href="/workflows" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200"><ArrowLeft size={14}/> Workflows</Link>
      <div className="mt-4"><SnapshotNotice state={stateStatus}/></div>
      {!configured ? <div className="mt-6"><ConfigurationRequired/></div> : query.isLoading ? <div className="mt-8 text-sm text-zinc-600">Reading finalized workflow…</div> : query.isError || !data ? <div className="mt-8 rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-5 text-sm text-rose-200">Unable to load workflow #{id}.</div> : <>
        <section className="mt-6 flex flex-col justify-between gap-5 border-b border-white/[.07] pb-8 lg:flex-row lg:items-end"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-zinc-600">Workflow #{id}</span><StatusBadge value={data.workflow.status}/></div><h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">{data.workflow.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">{data.workflow.mission}</p></div><WorkflowToolbar workflowId={id} status={data.workflow.status} owner={data.workflow.owner} deadline={data.workflow.deadline}/></section>
        <div className="mt-7 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
          <section className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-5"><div className="mb-5 flex items-center justify-between"><div><div className="text-xs uppercase tracking-[.17em] text-zinc-600">Graph</div><h2 className="mt-1 font-medium">Registered handoffs</h2></div><span className="text-xs text-zinc-600">{data.handoffs.length} total</span></div><WorkflowGraph handoffs={graph}/></section>
          <aside className="space-y-4">
            <div className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={16} className="text-emerald-300"/> Evidence policy #{asNumber(data.workflow.policy_id)}</div><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-zinc-600">Fingerprint</span><span className="max-w-[58%] truncate font-mono text-xs text-zinc-300">{data.policy.fingerprint_sha256}</span></div><div className="flex justify-between"><span className="text-zinc-600">Issuers</span><span>{asNumber(data.policy.minimum_distinct_issuers)} minimum</span></div><div className="flex justify-between"><span className="text-zinc-600">Publishers</span><span>{asNumber(data.policy.minimum_distinct_publishers)} minimum</span></div><div className="flex justify-between"><span className="text-zinc-600">Owner</span><span>{shortAddress(data.policy.owner)}</span></div></div></div>
            <div className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><div><div className="flex items-center gap-2 text-xs text-zinc-600"><CalendarClock size={14}/> Workflow deadline</div><div className="mt-2 text-sm">{formatUnix(data.workflow.deadline)}</div></div>{data.handoffs[0] ? <div><div className="flex items-center gap-2 text-xs text-zinc-600"><CircleDollarSign size={14}/> First handoff principal</div><div className="mt-2 text-sm">{formatGen(data.handoffs[0].value.principal_required)}</div></div> : null}</div></div>
          </aside>
        </div>
        {data.handoffs.length ? <section className="mt-5 space-y-3"><div className="px-1 text-xs uppercase tracking-[.17em] text-zinc-600">Escrow & dispute actions</div>{data.handoffs.map(({id: handoffId, value, caseId}) => <HandoffActions key={handoffId} workflowId={id} handoffId={handoffId} handoff={value} caseId={caseId} workflowOwner={data.workflow.owner}/>)}</section> : null}
      </>}
    </AppShell>
  );
}
