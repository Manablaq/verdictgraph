"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Flag,
  Printer,
  Share2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BRADBURY_CHAIN_ID, BRADBURY_EXPLORER } from "@/lib/genlayer/client";
import { formatGen, formatUnix } from "@/lib/format";
import { readMilestoneVaultSnapshot, verifyMilestoneTopology } from "@/lib/genlayer/milestone-vault";
import { canonicalJson, sha256Text, type JsonValue } from "@/lib/proof-pack";
import { buildMilestoneProofPack, consequenceLabel, MILESTONE_PROOF_SCHEMA } from "@/lib/milestone-proof";
import type { MilestoneData } from "@/lib/milestone-data";
import { StatusBadge } from "./status-badge";

type Criterion = { id: number; text: string };

export function MilestoneProof({ milestoneId, data }: { milestoneId: number; data: MilestoneData }) {
  const [digest, setDigest] = useState<string | null>(null);
  const topology = useQuery({ queryKey: ["milestone-proof-topology"], queryFn: verifyMilestoneTopology, retry: false });
  const vault = useQuery({
    queryKey: ["milestone-proof-vault", milestoneId],
    queryFn: () => readMilestoneVaultSnapshot(BigInt(milestoneId)),
    enabled: topology.isSuccess,
    retry: false,
  });
  const vaultRead = useMemo(
    () => (vault.data ? { ...vault.data, source: "latest-live-evm-read" as const } : null),
    [vault.data],
  );
  const pack = useMemo(
    () => buildMilestoneProofPack(milestoneId, data, vaultRead, topology.isSuccess, topology.data?.vault ?? null),
    [milestoneId, data, vaultRead, topology.isSuccess, topology.data?.vault],
  );

  useEffect(() => {
    let current = true;
    void sha256Text(canonicalJson(pack as unknown as JsonValue)).then((value) => {
      if (current) setDigest(value);
    });
    return () => {
      current = false;
    };
  }, [pack]);

  const exported = useMemo(() => ({ ...pack, pack_digest_sha256: digest }), [pack, digest]);
  const criteria = Array.isArray(pack.milestone.criteria) ? pack.milestone.criteria as Criterion[] : [];

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Clipboard access was blocked by the browser");
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `verdictgraph-milestone-${milestoneId}-proof-pack.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Milestone Proof Pack downloaded");
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `VerdictGraph Milestone #${milestoneId}`, text: "Finalized GenLayer milestone record", url: window.location.href });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    await copy(window.location.href, "Proof Pack link copied");
  }

  return (
    <div className="milestone-proof min-w-0 w-full space-y-5 overflow-x-clip">
      <section className="print-surface rounded-[30px] border border-sky-300/15 bg-[linear-gradient(135deg,rgba(56,189,248,.10),rgba(255,255,255,.025)_45%,rgba(255,255,255,.015))] p-6 shadow-2xl shadow-black/20 lg:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[.18em] text-sky-200/65"><FileCheck2 size={15} /> Public milestone proof · {MILESTONE_PROOF_SCHEMA}</div>
            <div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-.04em]">Milestone #{milestoneId}</h1><StatusBadge value={data.value.status} /><StatusBadge value={pack.snapshot.protocol_state === "reviewed" ? "REVIEWED" : "PROVISIONAL"} icon={pack.snapshot.protocol_state === "reviewed" ? <ShieldCheck size={12} /> : <CircleAlert size={12} />} /></div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">{data.value.objective}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500"><span>{data.value.title}</span><span>Project {data.value.project_ref}</span><span>GenLayer Bradbury · Chain {BRADBURY_CHAIN_ID}</span><span>Baseline locked</span></div>
          </div>
          <div className="no-print flex flex-wrap gap-2 lg:max-w-[300px] lg:justify-end"><button onClick={() => void share()} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-4 py-2.5 text-xs text-zinc-100"><Share2 size={14} /> Share</button><button onClick={() => void copy(window.location.href, "Proof Pack link copied")} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-4 py-2.5 text-xs text-zinc-100"><Copy size={14} /> Copy link</button><button onClick={download} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-medium text-black"><Download size={14} /> Export JSON</button><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-4 py-2.5 text-xs text-zinc-100"><Printer size={14} /> Print</button></div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Baseline" value={`${pack.baseline.sha256.slice(0, 12)}…`} detail="SHA-256 pinned" /><Metric label="Submission" value={pack.submission ? `Version ${pack.submission.version}` : "Pending"} detail={pack.submission ? `${pack.submission.sha256.slice(0, 12)}…` : "No hash-pinned result"} /><Metric label="Decision" value={pack.review?.decision ?? "Pending review"} detail={pack.review ? `Review #${pack.review.id}` : "No finalized review"} /><Metric label="Vault" value={pack.vault?.label ?? "Unavailable"} detail="Latest deterministic EVM read" /></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Check label="Acceptance authority" good={pack.verification.acceptance_authority_registered} detail={pack.verification.acceptance_authority_registered ? "Project is backed by the Authority trust-root record" : "Accepted project provenance is unavailable"} />
        <Check label="Baseline hash pinned" good={pack.verification.baseline_hash_pinned} detail={pack.verification.baseline_hash_pinned ? "Accepted baseline has a valid SHA-256 digest" : "Baseline digest is malformed"} />
        <Check label="Submission hash pinned" good={pack.verification.submission_hash_pinned} detail={pack.verification.submission_hash_pinned ? "Submitted bytes are bound to a digest" : "No valid submission digest yet"} />
        <Check label="GenLayer review" good={pack.verification.validator_review_present} detail={pack.verification.validator_review_present ? "Latest review is stored on the Registry" : "Review has not completed"} />
        <Check label="IC/Vault topology" good={pack.verification.topology_verified} pending={topology.isLoading} detail={topology.isSuccess ? "Authority, Registry, Adjudicator and Vault bindings verified" : topology.isLoading ? "Reading deployment identity…" : "Binding could not be verified"} />
        <Check label="Authority source" good={pack.verification.authority_source_pinned} detail={pack.verification.authority_source_pinned ? "Exact Authority source digest is configured" : "Published Authority source identity is missing"} />
        <Check label="Registry source" good={pack.verification.registry_source_pinned} detail={pack.verification.registry_source_pinned ? "Exact Registry source digest is configured" : "Published Registry source identity is missing"} />
        <Check label="Adjudicator source" good={pack.verification.adjudicator_source_pinned} detail={pack.verification.adjudicator_source_pinned ? "Exact Adjudicator source digest is configured" : "Published Adjudicator source identity is missing"} />
        <Check label="Vault runtime" good={pack.verification.vault_runtime_pinned} detail={pack.verification.vault_runtime_pinned ? "Deployed Vault bytecode matches the published digest" : "Vault runtime identity is missing"} />
        <Check label="Exact Vault terms" good={pack.verification.vault_terms_match} detail={pack.verification.vault_terms_match ? "Live escrow terms match the finalized milestone" : "Live escrow terms could not be matched"} />
        <Check label="Settlement boundary" good={pack.verification.settlement_boundary} detail={pack.verification.settlement_boundary ? "Vault read is independently bound to exact terms" : "Settlement identity is incomplete"} />
        <Check label="GenLayer chain finality" good={pack.verification.finality_safe} detail="This pack reads the finalized GenLayer transaction variant" />
        <Check label="EVM block anchor" good={pack.verification.evm_block_anchored} detail={pack.verification.evm_block_anchored ? `Vault read anchored at block ${pack.vault?.block_number}` : "The live Vault read has no block hash anchor"} />
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <section className="print-card min-w-0 rounded-[28px] border border-white/[.08] bg-white/[.025] p-6"><Heading icon={<ShieldCheck size={16} />} eyebrow="Authority record" title="The accepted project trust root" detail="The baseline cannot be replaced by a milestone creator; it is inherited from the authority-registered project." /><div className="mt-6 space-y-3"><Document label={`Accepted baseline · project ${pack.acceptance.project_ref}`} uri={pack.acceptance.baseline_uri} sha={pack.acceptance.baseline_sha256} /><Document label="Acceptance record" uri={pack.acceptance.acceptance_record_uri} sha={pack.acceptance.acceptance_record_sha256} /><div className="rounded-2xl border border-white/[.08] bg-black/20 p-4 text-xs text-zinc-500"><Key label="Authority" value={pack.acceptance.authority} /><Key label="Registered sponsor" value={pack.acceptance.sponsor} /><Key label="Baseline mirror" value={pack.acceptance.baseline_mirror_uri} /><Key label="Acceptance mirror" value={pack.acceptance.acceptance_record_mirror_uri} /><Key label="Submission origins" value={pack.acceptance.submission_origins_json} /></div></div></section>
        <section className="print-card min-w-0 rounded-[28px] border border-white/[.08] bg-white/[.025] p-6"><Heading icon={<ShieldCheck size={16} />} eyebrow="Before / after" title="The accepted baseline and submitted change" detail="The protocol compares two hash-pinned documents; it does not trust a client-side claim." /><div className="mt-6 space-y-3"><Document label="Accepted baseline" uri={pack.baseline.uri} sha={pack.baseline.sha256} />{pack.submission ? <Document label={`Submitted result · version ${pack.submission.version}`} uri={pack.submission.uri} sha={pack.submission.sha256} /> : <Empty text="No submission is recorded yet." />}</div><div className="mt-6 text-xs uppercase tracking-[.16em] text-zinc-600">Registered success criteria</div><ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-400">{criteria.map((item) => <li key={item.id} className="flex gap-3"><span className="font-mono text-zinc-700">{item.id}</span><span>{item.text}</span></li>)}</ul></section>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <section className="print-card min-w-0 rounded-[28px] border border-white/[.08] bg-white/[.025] p-6"><Heading icon={<Flag size={16} />} eyebrow="Consensus record" title="Latest GenLayer decision" detail="The controller stores the exact consequence selected by the review." />{pack.review ? <div className="mt-6 rounded-2xl border border-sky-300/15 bg-sky-300/[.05] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge value={pack.review.decision} /><span className="font-mono text-[11px] text-zinc-600">Review #{pack.review.id}</span></div><p className="mt-4 text-sm leading-6 text-zinc-200">{pack.review.summary}</p><div className="mt-4 text-xs leading-5 text-zinc-600">{consequenceLabel(pack.review.consequence_rule_id)}<br /><span className="break-all">Review digest <span className="font-mono text-zinc-500">{pack.review.review_sha256}</span></span></div></div> : <div className="mt-6"><Empty text="This milestone has no finalized review yet." /></div>}</section>
        <section className="print-card min-w-0 rounded-[28px] border border-white/[.08] bg-white/[.025] p-6"><Heading icon={<WalletCards size={16} />} eyebrow="Economic boundary" title="Exact escrow terms" detail="These values come from the finalized Controller record and the latest live Vault read." /><dl className="mt-6 space-y-3 text-sm"><Key label="Owner" value={data.value.owner} /><Key label="Beneficiary" value={data.value.beneficiary} /><Key label="Principal" value={formatGen(data.value.principal_required)} /><Key label="Beneficiary bond" value={formatGen(data.value.beneficiary_bond_required)} /><Key label="Escrow status" value={pack.vault?.label ?? "Unavailable"} /></dl>{pack.vault ? <div className="mt-6 rounded-2xl border border-white/[.08] bg-black/20 p-4"><div className="text-[11px] uppercase tracking-[.15em] text-zinc-600">Live Vault escrow snapshot</div><dl className="mt-4 space-y-3 text-xs"><Key label="Vault owner" value={pack.vault.escrow.owner} /><Key label="Vault beneficiary" value={pack.vault.escrow.beneficiary} /><Key label="Principal required" value={pack.vault.escrow.principal_required} /><Key label="Bond required" value={pack.vault.escrow.beneficiary_bond_required} /><Key label="Funding deadline" value={formatUnix(pack.vault.escrow.funding_deadline)} /><Key label="Recovery deadline" value={formatUnix(pack.vault.escrow.recovery_deadline)} /><Key label="Terms digest" value={pack.vault.escrow.terms_sha256} /><Key label="EVM block number" value={pack.vault.block_number} /><Key label="EVM block hash" value={pack.vault.block_hash} /></dl></div> : <div className="mt-6"><Empty text={vault.isLoading ? "Reading live Vault escrow…" : "Live Vault escrow is unavailable."} /></div>}</section>
      </div>

      {pack.challenges.length ? <section className="print-card rounded-[28px] border border-orange-300/15 bg-orange-300/[.025] p-6"><Heading icon={<Flag size={16} />} eyebrow="Challenge history" title="Every challenge remains attributable" detail="The active milestone fields show the latest challenge; this immutable history preserves every bounded challenge and its re-review link." /><div className="mt-6 grid gap-3 md:grid-cols-2">{pack.challenges.map((challenge) => <div key={challenge.number} className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><div className="flex items-center justify-between gap-3 text-xs"><span className="uppercase tracking-[.15em] text-orange-200/60">Challenge #{challenge.number}</span><span className="font-mono text-zinc-600">{challenge.challenged_at}</span></div><p className="mt-3 text-sm leading-6 text-zinc-300">{challenge.reason}</p><div className="mt-3 break-all text-xs text-zinc-600">By {challenge.challenged_by} · review {challenge.resolved_review_id === "0" ? "pending" : `#${challenge.resolved_review_id}`}</div></div>)}</div></section> : null}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_.8fr]"><section className="print-card min-w-0 rounded-[28px] border border-white/[.08] bg-white/[.025] p-6"><Heading icon={<Clock3 size={16} />} eyebrow="Interpretation" title="What this artifact proves" detail="A precise record is stronger than an inflated claim." /><div className="mt-5 grid gap-3 sm:grid-cols-3"><Note title="Hash" text={pack.interpretation.hash_proves} /><Note title="Decision" text={pack.interpretation.decision_proves} /><Note title="Settlement" text={pack.interpretation.settlement_proves} /></div></section><section className="print-card min-w-0 rounded-[28px] border border-white/[.08] bg-white/[.025] p-6"><Heading icon={<ExternalLink size={16} />} eyebrow="Machine identity" title="Reproduce this pack" detail="Canonical JSON key ordering is hashed locally for comparison." /><div className="mt-5 space-y-3 text-xs text-zinc-600"><Key label="Milestone reference" value={pack.milestone.reference} /><Key label="Terms digest" value={pack.baseline.terms_sha256} /><Key label="Pack digest" value={digest ?? "Computing…"} /><Key label="Authority source" value={pack.contracts.milestone_authority_source_sha256 || "Not configured"} /><Key label="Registry source" value={pack.contracts.milestone_registry_source_sha256 || "Not configured"} /><Key label="Adjudicator source" value={pack.contracts.milestone_adjudicator_source_sha256 || "Not configured"} /><Key label="Vault runtime" value={pack.contracts.milestone_vault_runtime_sha256 || "Not configured"} /><Key label="Authority" value={pack.contracts.milestone_authority || "Not configured"} /><Key label="Registry" value={pack.contracts.milestone_registry || "Not configured"} /><Key label="Adjudicator" value={pack.contracts.milestone_adjudicator || "Not configured"} /><Key label="Vault" value={pack.contracts.milestone_vault || "Not verified"} /></div>{pack.contracts.milestone_registry ? <a href={`${BRADBURY_EXPLORER}/address/${pack.contracts.milestone_registry}`} target="_blank" rel="noreferrer" className="no-print mt-5 inline-flex items-center gap-2 text-xs text-sky-200/70">Open Registry in Explorer <ExternalLink size={12} /></a> : null}</section></div>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.018] px-4 py-3 text-xs text-zinc-600"><span>Finalized GenLayer chain read · {pack.snapshot.protocol_state === "reviewed" ? "reviewed protocol state" : "provisional protocol state"} · no wallet required</span><button onClick={download} className="inline-flex items-center gap-2 text-zinc-300"><Download size={13} /> Download machine-readable copy</button></div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><div className="text-[11px] uppercase tracking-[.14em] text-zinc-600">{label}</div><div className="mt-2 truncate text-sm text-zinc-100">{value}</div><div className="mt-1 truncate text-[11px] text-zinc-600">{detail}</div></div>;
}

function Check({ label, good, detail, pending = false }: { label: string; good: boolean; detail: string; pending?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${pending ? "border-sky-300/15 bg-sky-300/[.035]" : good ? "border-emerald-300/15 bg-emerald-300/[.035]" : "border-amber-300/15 bg-amber-300/[.035]"}`}><div className="flex items-center gap-2 text-sm font-medium">{pending ? <Clock3 size={15} className="text-sky-300" /> : good ? <CheckCircle2 size={15} className="text-emerald-300" /> : <CircleAlert size={15} className="text-amber-300" />}{label}</div><div className="mt-2 text-xs leading-5 text-zinc-500">{detail}</div></div>;
}

function Heading({ icon, eyebrow, title, detail }: { icon: ReactNode; eyebrow: string; title: string; detail: string }) {
  return <div><div className="flex items-center gap-2 text-xs uppercase tracking-[.17em] text-zinc-600">{icon}{eyebrow}</div><h2 className="mt-2 text-lg font-medium">{title}</h2><p className="mt-2 text-xs leading-5 text-zinc-600">{detail}</p></div>;
}

function Document({ label, uri, sha }: { label: string; uri: string; sha: string }) {
  return <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><div className="text-[11px] uppercase tracking-[.15em] text-zinc-600">{label}</div><a href={uri} target="_blank" rel="noreferrer" className="mt-2 block break-all font-mono text-xs leading-5 text-sky-200/70">{uri}</a><div className="mt-4 break-all rounded-xl bg-black/20 p-3 font-mono text-[11px] text-zinc-500">SHA-256 {sha}</div></div>;
}

function Key({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-white/[.06] pb-3 last:border-b-0 last:pb-0"><dt className="shrink-0 text-zinc-600">{label}</dt><dd className="max-w-[70%] break-all text-right text-zinc-200">{value}</dd></div>;
}

function Note({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><div className="text-xs font-medium text-zinc-300">{title}</div><p className="mt-2 text-xs leading-5 text-zinc-600">{text}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">{text}</div>;
}
