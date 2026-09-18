"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, CircleDollarSign, FileCheck2, Flag, ShieldCheck, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MilestoneActions } from "@/components/milestone-actions";
import { MilestoneConfigurationRequired } from "@/components/milestone-configuration-required";
import { StatusBadge } from "@/components/status-badge";
import { isMilestoneConfigured } from "@/lib/genlayer/client";
import { verifyMilestoneTopology } from "@/lib/genlayer/milestone-vault";
import { asNumber, formatGen, formatUnix, shortAddress } from "@/lib/format";
import { loadMilestoneData } from "@/lib/milestone-data";

function criteria(value: string): { id: number; text: string }[] {
  try { return JSON.parse(value) as { id: number; text: string }[]; } catch { return []; }
}

export default function MilestoneDetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const milestoneId = Number(rawId);
  const configured = isMilestoneConfigured();
  const query = useQuery({
    queryKey: ["milestone", milestoneId],
    queryFn: async () => { await verifyMilestoneTopology(); return loadMilestoneData(milestoneId); },
    enabled: configured && Number.isInteger(milestoneId) && milestoneId > 0,
    refetchInterval: (current) => current.state.data?.value.status === "REVIEW_PENDING" ? 15_000 : false,
  });
  const data = query.data;
  return <AppShell>
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/milestones" className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft size={14}/> Milestones</Link>{data ? <Link href={`/milestones/${milestoneId}/proof`} className="inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/[.05] px-4 py-2.5 text-sm text-sky-100"><FileCheck2 size={15}/> Public Proof Pack</Link> : null}</div>
    {!configured ? <div className="mt-8"><MilestoneConfigurationRequired /></div> : query.isLoading ? <div className="mt-8 text-sm text-zinc-600">Reading finalized milestone state…</div> : query.isError || !data ? <div className="mt-8 rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-5 text-sm text-rose-200">Milestone #{milestoneId} could not be loaded.</div> : <>
      <section className="mt-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs uppercase tracking-[.2em] text-zinc-600">Milestone #{milestoneId}</span><StatusBadge value={data.value.status}/></div><h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-.04em]">{data.value.title}</h1><p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-500">{data.value.objective}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600"><span>Project {data.value.project_ref}</span><span className="font-mono">{data.value.reference}</span></div></div><div className="text-right text-xs text-zinc-600">Created {formatUnix(data.value.created_at)}</div></section>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={CircleDollarSign} label="Principal" value={formatGen(data.value.principal_required)}/><Metric icon={ShieldCheck} label="Beneficiary" value={shortAddress(data.value.beneficiary, 7)}/><Metric icon={CalendarClock} label="Submission deadline" value={formatUnix(data.value.submission_deadline)}/><Metric icon={Flag} label="Challenges" value={`${asNumber(data.value.challenge_count)} / 2`}/></div>
      <div className="mt-6"><MilestoneActions milestoneId={milestoneId} milestone={data.value} allowedSubmissionOriginsJson={data.acceptedProject.submission_origins_json}/></div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={16} className="text-emerald-300"/> Accepted baseline</div><p className="mt-4 text-xs text-zinc-600">Inherited from the authority-registered project <span className="font-mono text-zinc-400">{data.value.project_ref}</span></p><p className="mt-3 break-all font-mono text-xs leading-5 text-zinc-500">{data.value.baseline_uri}</p><div className="mt-4 break-all rounded-xl bg-black/20 p-3 font-mono text-[11px] text-zinc-600">SHA-256 {data.value.baseline_sha256}</div><div className="mt-6 text-xs uppercase tracking-[.16em] text-zinc-600">Success criteria</div><ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-400">{criteria(data.value.criteria_json).map((item) => <li key={item.id} className="flex gap-3"><span className="font-mono text-zinc-700">{item.id}</span><span>{item.text}</span></li>)}</ul></section><section className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><div className="flex items-center gap-2 text-sm font-medium"><FileCheck2 size={16} className="text-sky-300"/> Submitted result</div>{data.submission ? <><p className="mt-4 break-all font-mono text-xs leading-5 text-zinc-500">{data.submission.uri}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs text-zinc-600"><span>Version {asNumber(data.submission.version)}</span><span>Submitted {formatUnix(data.submission.submitted_at)}</span></div><div className="mt-4 break-all rounded-xl bg-black/20 p-3 font-mono text-[11px] text-zinc-600">SHA-256 {data.submission.sha256}</div></> : <p className="mt-4 text-sm leading-6 text-zinc-600">No work submission has been recorded yet.</p>}{data.value.challenge_reason ? <div className="mt-6 rounded-2xl border border-orange-300/15 bg-orange-300/[.04] p-4 text-sm leading-6 text-orange-100/80"><div className="text-xs uppercase tracking-[.16em] text-orange-300/70">Active challenge</div><p className="mt-2">{data.value.challenge_reason}</p>{data.value.challenged_by ? <p className="mt-2 text-xs text-orange-100/60">Challenged by <span className="font-mono">{shortAddress(data.value.challenged_by, 8)}</span> · {formatUnix(data.value.challenged_at)}</p> : null}</div> : null}</section></div>
      <section className="mt-6 rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><div className="flex items-center gap-2 text-sm font-medium"><GavelIcon /> GenLayer decision</div>{data.review ? <div className="mt-5 grid gap-5 lg:grid-cols-[.7fr_1fr]"><div><div className="flex flex-wrap items-center gap-2"><StatusBadge value={data.review.decision}/><span className="text-xs text-zinc-600">Review #{asNumber(data.value.latest_review_id)}</span></div><p className="mt-4 text-sm leading-6 text-zinc-400">{data.review.summary}</p></div><div className="space-y-3 text-xs text-zinc-600"><div>Consequence rule <span className="font-mono text-zinc-400">{asNumber(data.review.consequence_rule_id)}</span></div><div className="break-all">Evidence set <span className="font-mono text-zinc-400">{data.review.source_set_sha256}</span></div><div className="break-all">Review digest <span className="font-mono text-zinc-400">{data.review.review_sha256}</span></div><div>Resolved {formatUnix(data.review.resolved_at)}</div></div></div> : <p className="mt-4 text-sm leading-6 text-zinc-600">The milestone has not reached a finalized GenLayer review.</p>}</section>
    </>}
  </AppShell>;
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) { return <div className="rounded-2xl border border-white/[.07] bg-white/[.02] p-4"><Icon size={15} className="text-zinc-500"/><div className="mt-4 text-xs text-zinc-600">{label}</div><div className="mt-1 text-sm text-zinc-200">{value}</div></div>; }
function GavelIcon() { return <Flag size={16} className="text-violet-300"/>; }
