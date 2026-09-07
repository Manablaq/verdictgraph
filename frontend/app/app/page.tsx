"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, FileCheck2, GitFork, Scale, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import { MetricCard } from "@/components/metric-card";
import {
  isProtocolConfigured,
  readRegistry,
  readAdjudicator,
} from "@/lib/genlayer/client";
import { asNumber } from "@/lib/format";

async function loadCounts() {
  const [workflows, handoffs, cases, evidence, verdicts] = await Promise.all([
    readRegistry<bigint>("get_workflow_count"),
    readRegistry<bigint>("get_handoff_count"),
    readAdjudicator<bigint>("get_case_count"),
    readAdjudicator<bigint>("get_evidence_count"),
    readAdjudicator<bigint>("get_verdict_count"),
  ]);
  return { workflows, handoffs, cases, evidence, verdicts };
}

export default function DashboardPage() {
  const configured = Boolean(isProtocolConfigured());
  const query = useQuery({ queryKey: ["protocol-counts"], queryFn: loadCounts, enabled: configured });
  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Protocol overview</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Operational accountability, not another black box.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">Finalized contract state only. Accepted-but-appealable transactions are never presented here as settled facts.</p></div>
          <Link href="/create" className="inline-flex items-center gap-2 self-start rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black">Create workflow <ArrowRight size={15}/></Link>
        </section>
        {!configured ? <ConfigurationRequired /> : query.isError ? <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-5 text-sm text-rose-200">Unable to read finalized VerdictGraph state: {query.error instanceof Error ? query.error.message : "Unknown error"}</div> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Workflows" value={query.data ? asNumber(query.data.workflows) : "—"} detail="Registered workflow graphs" icon={GitFork}/>
            <MetricCard label="Handoffs" value={query.data ? asNumber(query.data.handoffs) : "—"} detail="Explicit responsibility boundaries" icon={Activity}/>
            <MetricCard label="Cases" value={query.data ? asNumber(query.data.cases) : "—"} detail="Disputed handoffs" icon={Scale}/>
            <MetricCard label="Evidence" value={query.data ? asNumber(query.data.evidence) : "—"} detail="Authority-bound records" icon={ShieldCheck}/>
            <MetricCard label="Verdicts" value={query.data ? asNumber(query.data.verdicts) : "—"} detail="Exact consensus outcomes" icon={FileCheck2}/>
          </div>
        )}
        <section className="grid gap-4 lg:grid-cols-3">
          {[
            ["01", "Bind the trust boundary", "Policies name approved issuer addresses, publisher boundaries, freshness windows and corroboration thresholds before a workflow activates."],
            ["02", "Adjudicate the handoff", "Validators independently fetch the pinned evidence and reapply the registered criteria. Shape-only validation cannot pass."],
            ["03", "Settle only the latest verdict", "A post-review response window can supersede an old verdict. Only the latest current revision may queue finality-only settlement."],
          ].map(([n, title, text]) => <div key={n} className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-6"><div className="font-mono text-xs text-zinc-700">{n}</div><h2 className="mt-8 text-lg font-medium">{title}</h2><p className="mt-3 text-sm leading-6 text-zinc-500">{text}</p></div>)}
        </section>
      </div>
    </AppShell>
  );
}
