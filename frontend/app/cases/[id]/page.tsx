"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Scale } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CaseActions } from "@/components/case-actions";
import { ConfigurationRequired } from "@/components/configuration-required";
import { ConsensusTimeline } from "@/components/consensus-timeline";
import { EvidenceTrustPanel } from "@/components/evidence-trust-panel";
import { SnapshotNotice } from "@/components/snapshot-notice";
import { StatusBadge } from "@/components/status-badge";
import { getCoreAddress, readCore } from "@/lib/genlayer/client";
import { asNumber, formatUnix, shortAddress } from "@/lib/format";
import type { CaseRecord, EvidencePolicyRecord, EvidenceRecord, HandoffRecord, RevisionRecord, VerdictRecord, WorkflowRecord } from "@/lib/types";

async function loadCase(id: number, stateStatus: "accepted" | "finalized") {
  const caseRecord = await readCore<CaseRecord>("get_case", [BigInt(id)], stateStatus);
  const workflow = await readCore<WorkflowRecord>("get_workflow", [caseRecord.workflow_id], stateStatus);
  const [policy, handoff, revision] = await Promise.all([
    readCore<EvidencePolicyRecord>("get_policy", [workflow.policy_id], stateStatus),
    readCore<HandoffRecord>("get_handoff", [caseRecord.handoff_id], stateStatus),
    readCore<RevisionRecord>("get_revision", [BigInt(id), caseRecord.current_revision], stateStatus),
  ]);
  const evidence = await Promise.all(
    Array.from({ length: asNumber(revision.evidence_count) }, async (_, index) => {
      const evidenceId = asNumber(
        await readCore<bigint>("get_revision_evidence_id", [BigInt(id), caseRecord.current_revision, BigInt(index)], stateStatus),
      );
      return { id: evidenceId, value: await readCore<EvidenceRecord>("get_evidence", [BigInt(evidenceId)], stateStatus) };
    }),
  );
  const verdict = asNumber(caseRecord.latest_verdict_id) > 0
    ? await readCore<VerdictRecord>("get_verdict", [caseRecord.latest_verdict_id], stateStatus)
    : null;
  return { caseRecord, workflow, policy, handoff, revision, evidence, verdict };
}

export default function CasePage() {
  return (
    <Suspense fallback={<AppShell><div className="text-sm text-zinc-600">Loading case…</div></AppShell>}>
      <CaseContent />
    </Suspense>
  );
}

function CaseContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const stateStatus: "accepted" | "finalized" = search.get("state") === "accepted" ? "accepted" : "finalized";
  const id = Number(params.id);
  const configured = Boolean(getCoreAddress());
  const query = useQuery({
    queryKey: ["case", id, stateStatus],
    queryFn: () => loadCase(id, stateStatus),
    enabled: configured && Number.isInteger(id) && id > 0,
  });
  const d = query.data;
  const acceptedSuffix = stateStatus === "accepted" ? "?state=accepted" : "";

  return (
    <AppShell>
      <Link href="/workflows" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200"><ArrowLeft size={14}/> Explorer</Link>
      <div className="mt-4"><SnapshotNotice state={stateStatus}/></div>
      {!configured ? <div className="mt-6"><ConfigurationRequired/></div> : query.isLoading ? (
        <div className="mt-8 text-sm text-zinc-600">Reading {stateStatus} case state…</div>
      ) : query.isError || !d ? (
        <div className="mt-8 text-sm text-rose-300">Case could not be loaded.</div>
      ) : <>
        <section className="mt-6 flex flex-col justify-between gap-5 border-b border-white/[.07] pb-8 lg:flex-row lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-zinc-600">Case #{id} · Handoff #{asNumber(d.caseRecord.handoff_id)}</span><StatusBadge value={d.caseRecord.status}/>{d.caseRecord.settlement_queued ? <StatusBadge value="SETTLEMENT QUEUED"/> : null}</div>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-[-.035em]">{d.caseRecord.claim}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600"><span>{d.workflow.title}</span><span>Opened by {shortAddress(d.caseRecord.opener)}</span><span>Revision #{asNumber(d.caseRecord.current_revision)}</span><span>Recovery {formatUnix(d.caseRecord.recovery_deadline)}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.caseRecord.status === "OPEN" ? <Link href={`/cases/${id}/evidence${acceptedSuffix}`} className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm">Register evidence</Link> : null}
            {(d.caseRecord.status === "OPEN" || d.caseRecord.status === "REVIEWED" || d.caseRecord.status === "REPAIR_REQUIRED") ? <Link href={`/cases/${id}/respond${acceptedSuffix}`} className="rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black">Response / revision</Link> : null}
          </div>
        </section>

        <div className="mt-7 grid gap-5 xl:grid-cols-[.9fr_1.25fr_.72fr]">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5">
              <div className="flex items-center gap-2"><Scale size={16} className="text-zinc-500"/><h2 className="font-medium">Handoff responsibility</h2></div>
              <p className="mt-4 text-sm leading-6 text-zinc-400">{d.handoff.responsibility}</p>
              {d.handoff.delivery_uri ? <a href={d.handoff.delivery_uri} target="_blank" rel="noreferrer" className="mt-4 block rounded-xl border border-white/[.07] bg-black/20 p-3"><div className="text-[11px] uppercase tracking-[.14em] text-zinc-600">Provider delivery</div><div className="mt-2 truncate font-mono text-[11px] text-zinc-400">{d.handoff.delivery_sha256}</div><div className="mt-1 text-[11px] text-zinc-600">Submitted {formatUnix(d.handoff.delivery_submitted_at)}</div></a> : <div className="mt-4 rounded-xl border border-dashed border-white/10 p-3 text-xs text-zinc-600">No provider delivery was registered before this case.</div>}
              <div className="mt-5 border-t border-white/[.06] pt-4 text-xs text-zinc-600">Requester {shortAddress(d.handoff.requester)} · Provider {shortAddress(d.handoff.provider)}</div>
            </div>
            <EvidenceTrustPanel revision={d.revision}/>
            <CaseActions caseId={id} caseRecord={d.caseRecord} handoff={d.handoff} revision={d.revision} policy={d.policy} stateStatus={stateStatus}/>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5">
              <div className="flex items-center justify-between"><div><div className="text-xs uppercase tracking-[.17em] text-zinc-600">Evidence set</div><h2 className="mt-1 font-medium">Registered records</h2></div><span className="text-xs text-zinc-600">{d.evidence.length} records</span></div>
              <div className="mt-5 space-y-3">
                {d.evidence.length ? d.evidence.map(({ id: evidenceId, value }) => (
                  <a key={evidenceId} href={value.source_uri} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/[.07] bg-black/20 p-4 transition hover:border-white/[.13]">
                    <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="text-xs text-zinc-600">Evidence #{evidenceId} · v{asNumber(value.version)}</div><div className="mt-1 truncate text-sm">{value.stable_record_id}</div><div className="mt-2 truncate font-mono text-[11px] text-zinc-600">{value.expected_sha256}</div></div><ExternalLink size={14} className="shrink-0 text-zinc-700"/></div>
                    <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-600"><span>Issuer {shortAddress(value.issuer)}</span><span>Expires {formatUnix(value.expires_at)}</span><span>{value.corroboration_group}</span></div>
                  </a>
                )) : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">No evidence in this revision.</div>}
              </div>
            </div>
            {d.revision.response_uri ? <a href={d.revision.response_uri} target="_blank" rel="noreferrer" className="block rounded-[24px] border border-white/[.08] bg-white/[.025] p-5"><div className="text-xs uppercase tracking-[.17em] text-zinc-600">Authenticated party response</div><div className="mt-3 text-sm">{shortAddress(d.revision.response_author)}</div><div className="mt-2 truncate font-mono text-[11px] text-zinc-600">{d.revision.response_sha256}</div></a> : null}
            {d.verdict ? <div className="rounded-[24px] border border-sky-300/10 bg-sky-300/[.025] p-5"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-[.17em] text-zinc-600">Latest verdict</span><StatusBadge value={d.verdict.decision}/></div><p className="mt-4 text-sm leading-6 text-zinc-300">{d.verdict.summary}</p><div className="mt-5 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl border border-white/[.06] p-3"><div className="text-zinc-600">Rule</div><div className="mt-1">#{asNumber(d.verdict.violated_rule_id)}</div></div><div className="rounded-xl border border-white/[.06] p-3"><div className="text-zinc-600">Consequence</div><div className="mt-1">Rule {asNumber(d.verdict.consequence_rule_id)}</div></div></div><div className="mt-3 truncate font-mono text-[10px] text-zinc-700">{d.verdict.verdict_sha256}</div></div> : null}
          </div>

          <ConsensusTimeline reviewed={d.caseRecord.status === "REVIEWED"} settlementQueued={d.caseRecord.settlement_queued}/>
        </div>
      </>}
    </AppShell>
  );
}
