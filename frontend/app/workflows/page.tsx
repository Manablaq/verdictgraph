"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitFork, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import { StatusBadge } from "@/components/status-badge";
import { getCoreAddress, readCore } from "@/lib/genlayer/client";
import { asNumber, formatUnix, shortAddress } from "@/lib/format";
import type { WorkflowRecord } from "@/lib/types";

async function loadWorkflows() {
  const count = asNumber(await readCore<bigint>("get_workflow_count"));
  return Promise.all(Array.from({ length: count }, async (_, i) => ({ id: i + 1, value: await readCore<WorkflowRecord>("get_workflow", [BigInt(i + 1)]) })));
}

export default function WorkflowsPage() {
  const configured = Boolean(getCoreAddress());
  const query = useQuery({ queryKey: ["workflows"], queryFn: loadWorkflows, enabled: configured });
  return (
    <AppShell>
      <div className="flex items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Workflow explorer</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Responsibility graphs</h1></div><Link href="/create/workflow" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black"><Plus size={15}/> New workflow</Link></div>
      <div className="mt-8">{!configured ? <ConfigurationRequired/> : query.isLoading ? <div className="text-sm text-zinc-600">Reading finalized workflows…</div> : query.data?.length ? <div className="grid gap-3">{query.data.map(({ id, value }) => <Link key={id} href={`/workflows/${id}`} className="group rounded-[24px] border border-white/[.08] bg-white/[.02] p-5 transition hover:border-white/[.16] hover:bg-white/[.035]"><div className="flex flex-col gap-5 md:flex-row md:items-center"><div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-black/20"><GitFork size={17}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">#{id} · {value.title}</h2><StatusBadge value={value.status}/></div><p className="mt-2 line-clamp-2 text-sm text-zinc-500">{value.mission}</p></div><div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs text-zinc-600 md:text-right"><span>{asNumber(value.handoff_count)} handoffs</span><span>Policy #{asNumber(value.policy_id)}</span><span>{shortAddress(value.owner)}</span><span>{formatUnix(value.deadline)}</span></div><ArrowRight size={16} className="text-zinc-700 transition group-hover:translate-x-1 group-hover:text-zinc-300"/></div></Link>)}</div> : <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-600">No finalized workflows yet.</div>}</div>
    </AppShell>
  );
}
