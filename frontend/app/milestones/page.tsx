"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleDollarSign, Flag, Plus, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MilestoneConfigurationRequired } from "@/components/milestone-configuration-required";
import { StatusBadge } from "@/components/status-badge";
import { asNumber, formatGen, formatUnix, shortAddress } from "@/lib/format";
import { friendlyGenLayerError, isMilestoneConfigured, readMilestone, readMilestoneAuthority } from "@/lib/genlayer/client";
import { verifyMilestoneTopology } from "@/lib/genlayer/milestone-vault";
import type { MilestoneRecord } from "@/lib/types";
import { useState } from "react";

const MAX_MILESTONES_PER_LOAD = 50;

async function loadMilestones(page: number) {
  await verifyMilestoneTopology();
  const [totalRaw, acceptedProjectCountRaw] = await Promise.all([
    readMilestone<bigint>("get_milestone_count"),
    readMilestoneAuthority<bigint>("get_project_count"),
  ]);
  const total = asNumber(totalRaw);
  const acceptedProjectCount = asNumber(acceptedProjectCountRaw);
  const start = page * MAX_MILESTONES_PER_LOAD + 1;
  const count = Math.min(Math.max(total - start + 1, 0), MAX_MILESTONES_PER_LOAD);
  const items = await Promise.all(Array.from({ length: count }, async (_, index) => ({
    id: start + index,
    value: await readMilestone<MilestoneRecord>("get_milestone", [BigInt(start + index)]),
  })));
  return { items, total, acceptedProjectCount };
}

export default function MilestonesPage() {
  const [page, setPage] = useState(0);
  const configured = isMilestoneConfigured();
  const query = useQuery({ queryKey: ["milestones", page], queryFn: () => loadMilestones(page), enabled: configured });
  const totalPages = query.data ? Math.ceil(query.data.total / MAX_MILESTONES_PER_LOAD) : 0;
  const createHref = !configured ? "/setup" : query.data?.acceptedProjectCount ? "/milestones/create" : "/milestones/authority";
  const createLabel = !configured ? "Open setup" : query.isLoading ? "Checking prerequisites…" : query.data?.acceptedProjectCount ? "New milestone" : "Register accepted project";
  return (
    <AppShell>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Milestone settlement</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Prove the change. Settle the outcome.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">Lock an accepted baseline, submit a hash-pinned result, and let GenLayer validators decide whether the registered success criteria were met before the deterministic Vault releases or refunds funds.</p></div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <Link href="/milestones/authority" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.03] px-4 py-2.5 text-sm font-medium text-zinc-200 hover:border-white/20"><ShieldCheck size={15}/> Acceptance authority</Link>
          <Link href={createHref} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black"><Plus size={15}/> {createLabel}</Link>
        </div>
      </div>
      {query.data?.acceptedProjectCount ? <div className="mt-8 rounded-2xl border border-sky-300/15 bg-sky-300/[.04] p-4 text-sm leading-6 text-sky-100/75"><span className="font-medium text-sky-100">{query.data.acceptedProjectCount} accepted project trust {query.data.acceptedProjectCount === 1 ? "root is" : "roots are"} registered.</span> Registration does not create a milestone; the registered sponsor must create one from the authority-backed form.</div> : null}
      {!configured ? <div className="mt-8"><MilestoneConfigurationRequired /></div> : query.isError ? <div className="mt-8 rounded-2xl border border-rose-400/[.15] bg-rose-400/[.04] p-5 text-sm text-rose-200">Unable to read finalized milestone state: {friendlyGenLayerError(query.error, "Retry the finalized milestone read.")}</div> : query.isLoading ? <div className="mt-8 text-sm text-zinc-600">Reading finalized milestones…</div> : query.data?.total === 0 ? query.data.acceptedProjectCount === 0 ? <div className="mt-8 rounded-[28px] border border-dashed border-white/10 p-12 text-center" role="status"><h2 className="text-lg font-medium text-zinc-200">Register the accepted project first.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">Milestones inherit their baseline and sponsor from the finalized acceptance authority. Once that trust root is registered, this page will unlock milestone creation.</p><Link href="/milestones/authority" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black">Open acceptance authority <ArrowRight size={15}/></Link></div> : <div className="mt-8 rounded-[28px] border border-dashed border-white/10 p-12 text-center" role="status"><h2 className="text-lg font-medium text-zinc-200">No milestones yet.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">The accepted project is ready. Create the first baseline-backed commitment when the sponsor is ready.</p><Link href="/milestones/create" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black">Create first milestone <Plus size={15}/></Link></div> : query.data?.items.length ? <><div className="mt-8 grid gap-4 lg:grid-cols-2">{query.data.items.map(({ id, value }) => <Link key={id} href={`/milestones/${id}`} className="group rounded-[28px] border border-white/[.08] bg-white/[.02] p-6 transition hover:border-white/[.16]"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl border border-sky-300/15 bg-sky-300/[.05] text-sky-300"><Flag size={18}/></div><div><div className="text-xs text-zinc-600">Milestone #{id}</div><h2 className="mt-1 font-medium text-zinc-100">{value.title}</h2></div></div><StatusBadge value={value.status}/></div><p className="mt-5 line-clamp-2 text-sm leading-6 text-zinc-500">{value.objective}</p><div className="mt-6 grid grid-cols-2 gap-3 text-xs text-zinc-600"><span className="inline-flex items-center gap-1.5"><CircleDollarSign size={13}/> {formatGen(value.principal_required)}</span><span className="inline-flex items-center gap-1.5"><ShieldCheck size={13}/> {shortAddress(value.beneficiary)}</span><span>Submit by {formatUnix(value.submission_deadline)}</span><span>Challenges {asNumber(value.challenge_count)}/2</span></div><div className="mt-6 flex items-center gap-2 text-sm text-zinc-300">Open milestone <ArrowRight size={15} className="transition group-hover:translate-x-1"/></div></Link>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600"><span>Page {page + 1} of {totalPages} · {query.data.total} finalized milestones</span><div className="flex gap-2"><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || query.isFetching} className="rounded-full border border-white/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40">Previous page</button><button type="button" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page + 1 >= totalPages || query.isFetching} className="rounded-full border border-white/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40">Next page</button></div></div></> : <div className="mt-8 rounded-2xl border border-amber-300/[.15] bg-amber-300/[.04] p-5 text-sm text-amber-100/80">This page is no longer available. Return to the first page and refresh.</div>}
    </AppShell>
  );
}
