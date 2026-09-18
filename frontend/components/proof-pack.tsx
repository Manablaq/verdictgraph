"use client";

import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Printer,
  Share2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { type CaseData, type ProtocolState } from "@/lib/case-data";
import { asNumber, formatGen, formatUnix, shortAddress } from "@/lib/format";
import {
  BRADBURY_EXPLORER,
  BRADBURY_CHAIN_ID,
  getVaultAddress,
  VERDICTGRAPH_ADJUDICATOR_ADDRESS,
  VERDICTGRAPH_REGISTRY_ADDRESS,
  VERDICTGRAPH_VAULT_ADDRESS,
} from "@/lib/genlayer/client";
import { readVaultStatus, verifyVaultTopology } from "@/lib/genlayer/vault";
import {
  buildProofPack,
  canonicalJson,
  consequenceLabel,
  sha256Text,
  type JsonValue,
} from "@/lib/proof-pack";
import { SnapshotNotice } from "@/components/snapshot-notice";
import { StatusBadge } from "@/components/status-badge";

export function ProofPack({
  caseId,
  data,
  stateStatus,
}: {
  caseId: number;
  data: CaseData;
  stateStatus: ProtocolState;
}) {
  const [packDigest, setPackDigest] = useState<string | null>(null);
  const topology = useQuery({
    queryKey: ["proof-pack-topology"],
    queryFn: verifyVaultTopology,
  });
  const vault = useQuery({
    queryKey: ["proof-pack-vault", asNumber(data.caseRecord.handoff_id)],
    queryFn: () => readVaultStatus(data.caseRecord.handoff_id),
    enabled: Boolean(getVaultAddress()),
  });
  const pack = useMemo(
    () => buildProofPack(caseId, data, stateStatus, vault.data ?? null, topology.isSuccess),
    [caseId, data, stateStatus, topology.isSuccess, vault.data],
  );

  useEffect(() => {
    let current = true;
    void sha256Text(canonicalJson(pack as unknown as JsonValue)).then((digest) => {
      if (current) setPackDigest(digest);
    });
    return () => {
      current = false;
    };
  }, [pack]);

  const exportedPack = useMemo(
    () => ({ ...pack, pack_digest_sha256: packDigest }),
    [pack, packDigest],
  );

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Clipboard access was blocked by the browser");
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(exportedPack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `verdictgraph-case-${caseId}-proof-pack.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Proof Pack downloaded");
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `VerdictGraph Case #${caseId} Proof Pack`,
          text: "Evidence-bound case record on GenLayer Bradbury",
          url,
        });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    await copy(url, "Proof Pack link copied");
  }

  const issuerThresholdMet = asNumber(data.revision.distinct_issuer_count) >= asNumber(data.policy.minimum_distinct_issuers);
  const publisherThresholdMet = asNumber(data.revision.distinct_publisher_count) >= asNumber(data.policy.minimum_distinct_publishers);
  const vaultStatus = vault.data?.label ?? (vault.isLoading ? "Checking…" : "Unavailable");

  return (
    <div className="proof-pack min-w-0 w-full space-y-5 overflow-x-clip">
      <SnapshotNotice state={stateStatus} />

      <section className="print-surface rounded-[30px] border border-sky-300/15 bg-[linear-gradient(135deg,rgba(56,189,248,.10),rgba(255,255,255,.025)_45%,rgba(255,255,255,.015))] p-6 shadow-2xl shadow-black/20 lg:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[.18em] text-sky-200/65">
              <FileCheck2 size={15} /> Public proof pack · {pack.schema}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-.04em]">Case #{caseId}</h1>
              <StatusBadge value={data.caseRecord.status} />
              {stateStatus === "finalized" ? <StatusBadge value="FINALIZED" icon={<ShieldCheck size={12} />} /> : <StatusBadge value="PROVISIONAL" icon={<CircleAlert size={12} />} />}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">{data.caseRecord.claim}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
              <span>{data.workflow.title}</span>
              <span>Revision #{asNumber(data.caseRecord.current_revision)}</span>
              <span>GenLayer Bradbury · Chain {BRADBURY_CHAIN_ID}</span>
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2 lg:max-w-[290px] lg:justify-end">
            <button onClick={() => void share()} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-4 py-2.5 text-xs text-zinc-100"><Share2 size={14} /> Share</button>
            <button onClick={() => void copy(window.location.href, "Proof Pack link copied")} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-4 py-2.5 text-xs text-zinc-100"><Copy size={14} /> Copy link</button>
            <button onClick={download} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-medium text-black"><Download size={14} /> Export JSON</button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-4 py-2.5 text-xs text-zinc-100"><Printer size={14} /> Print</button>
          </div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProofMetric label="Snapshot" value={stateStatus === "finalized" ? "Finalized" : "Accepted / provisional"} detail="The state shown in this pack" />
          <ProofMetric label="Evidence" value={`${data.evidence.length} record${data.evidence.length === 1 ? "" : "s"}`} detail={`${asNumber(data.revision.distinct_issuer_count)} issuers · ${asNumber(data.revision.distinct_publisher_count)} publishers`} />
          <ProofMetric label="Decision" value={data.verdict?.decision ?? "Pending review"} detail={data.verdict ? `Rule ${asNumber(data.verdict.violated_rule_id)}` : "No verdict is registered"} />
          <ProofMetric label="Vault" value={vaultStatus} detail="Latest deterministic EVM read" />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <VerificationCheck label="Sealed evidence policy" good={data.policy.sealed} detail={data.policy.sealed ? `Policy #${asNumber(data.workflow.policy_id)} is sealed` : "Policy is not sealed"} />
        <VerificationCheck label="Issuer corroboration" good={issuerThresholdMet} detail={`${asNumber(data.revision.distinct_issuer_count)} / ${asNumber(data.policy.minimum_distinct_issuers)} required`} />
        <VerificationCheck label="Publisher corroboration" good={publisherThresholdMet} detail={`${asNumber(data.revision.distinct_publisher_count)} / ${asNumber(data.policy.minimum_distinct_publishers)} required`} />
        <VerificationCheck label="Consensus record" good={Boolean(data.verdict)} detail={data.verdict ? "Latest verdict is bound to this revision" : "Review has not produced a verdict"} />
        <VerificationCheck label="Deployment topology" good={topology.isSuccess} pending={topology.isLoading} detail={topology.isSuccess ? "Six-way Registry / Adjudicator / Vault check passed" : topology.isLoading ? "Reading finalized bindings…" : "Could not verify bindings"} />
        <VerificationCheck label="Finality boundary" good={stateStatus === "finalized"} detail={stateStatus === "finalized" ? "Safe for publication as finalized state" : "Do not present this snapshot as permanent"} />
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <section className="print-card min-w-0 w-full rounded-[28px] border border-white/[.08] bg-white/[.025] p-6">
          <SectionHeading icon={<ShieldCheck size={16} />} eyebrow="Evidence ledger" title="Authenticated records in this revision" detail="Hashes bind bytes; the sealed policy supplies authority." />
          <div className="mt-6 space-y-3">
            {data.evidence.length ? data.evidence.map(({ id, value }) => (
              <div key={id} className="rounded-2xl border border-white/[.08] bg-black/20 p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div className="min-w-0"><div className="text-[11px] uppercase tracking-[.15em] text-zinc-600">Evidence #{id} · Version {asNumber(value.version)}</div><div className="mt-1 truncate text-sm text-zinc-100">{value.stable_record_id}</div></div>
                  <a href={value.source_uri} target="_blank" rel="noreferrer" className="no-print inline-flex shrink-0 items-center gap-1.5 text-xs text-sky-200/70 hover:text-sky-100">Open source <ExternalLink size={12} /></a>
                </div>
                <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                  <HashField label="SHA-256" value={value.expected_sha256} />
                  <HashField label="Corroboration" value={value.corroboration_group || "Not set"} mono={false} />
                  <HashField label="Issuer" value={shortAddress(value.issuer, 8)} mono={false} />
                  <HashField label="Publisher boundary" value={value.publisher_prefix} mono={false} />
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-600"><span>Issued {formatUnix(value.issued_at)}</span><span>Observed {formatUnix(value.observed_at)}</span><span>Expires {formatUnix(value.expires_at)}</span></div>
              </div>
            )) : <EmptyState text="No evidence is registered in this revision." />}
          </div>
        </section>

        <div className="min-w-0 w-full space-y-5">
          <section className="print-card min-w-0 w-full rounded-[28px] border border-white/[.08] bg-white/[.025] p-6">
            <SectionHeading icon={<FileCheck2 size={16} />} eyebrow="Decision record" title="Latest consensus-bound outcome" detail="Only this revision can drive a future settlement." />
            {data.verdict ? <div className="mt-6 rounded-2xl border border-sky-300/15 bg-sky-300/[.05] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge value={data.verdict.decision} /><span className="font-mono text-[11px] text-zinc-600">Verdict #{asNumber(data.caseRecord.latest_verdict_id)}</span></div><p className="mt-4 text-sm leading-6 text-zinc-200">{data.verdict.summary}</p><dl className="mt-5 grid grid-cols-2 gap-3 text-xs"><KeyValue label="Violated rule" value={`#${asNumber(data.verdict.violated_rule_id)}`} /><KeyValue label="Fault class" value={data.verdict.fault_class} /><KeyValue label="Consequence" value={`Rule ${asNumber(data.verdict.consequence_rule_id)}`} /><KeyValue label="Resolved" value={formatUnix(data.verdict.resolved_at)} /></dl><div className="mt-4 border-t border-white/[.07] pt-3 text-[11px] leading-5 text-zinc-600">{consequenceLabel(data.verdict.consequence_rule_id)}<br />Verdict digest <span className="font-mono text-zinc-500">{data.verdict.verdict_sha256}</span></div></div> : <EmptyState text="This case has no consensus-bound verdict yet." />}
          </section>

          <section className="print-card min-w-0 w-full rounded-[28px] border border-white/[.08] bg-white/[.025] p-6">
            <SectionHeading icon={<WalletCards size={16} />} eyebrow="Economic boundary" title="Handoff and Vault state" detail="The EVM Vault performs fixed arithmetic after finalized messages. The status below is a latest live EVM read." />
            <dl className="mt-6 space-y-3 text-sm"><KeyValue label="Responsibility" value={data.handoff.responsibility} block /><KeyValue label="Requester" value={shortAddress(data.handoff.requester, 8)} /><KeyValue label="Provider" value={shortAddress(data.handoff.provider, 8)} /><KeyValue label="Principal" value={formatGen(data.handoff.principal_required)} /><KeyValue label="Provider bond" value={formatGen(data.handoff.provider_bond_required)} /><KeyValue label="Vault status" value={vaultStatus} /></dl>
            {data.handoff.delivery_uri ? <a href={data.handoff.delivery_uri} target="_blank" rel="noreferrer" className="no-print mt-5 block rounded-xl border border-white/[.07] bg-black/20 p-3 text-xs"><div className="text-zinc-600">Provider delivery</div><div className="mt-2 truncate font-mono text-[11px] text-zinc-400">{data.handoff.delivery_sha256}</div></a> : null}
          </section>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[1fr_.8fr]">
        <section className="print-card min-w-0 w-full rounded-[28px] border border-white/[.08] bg-white/[.025] p-6">
          <SectionHeading icon={<Clock3 size={16} />} eyebrow="Publication notes" title="How to read this artifact" detail="The Proof Pack is transparent about what the protocol does—and does not—prove." />
          <div className="mt-6 grid gap-3 sm:grid-cols-3"><Note title="Hash proves" text="The fetched bytes match the registered SHA-256 digest." /><Note title="Authority comes from" text="The sealed policy’s approved issuer address and publisher boundary." /><Note title="Settlement boundary" text="Only finality-only messages can trigger deterministic Vault consequences." /></div>
          <div className="mt-5 rounded-2xl border border-amber-300/10 bg-amber-300/[.035] p-4 text-xs leading-5 text-amber-100/70">This dossier is an evidence-bound protocol record, not a legal judgment and not an independent guarantee that an issuer’s real-world statement is true.</div>
        </section>

        <section className="print-card min-w-0 w-full rounded-[28px] border border-white/[.08] bg-white/[.025] p-6">
          <SectionHeading icon={<ExternalLink size={16} />} eyebrow="Deployment boundary" title="Audited contract addresses" detail="These are the immutable Bradbury endpoints used by the app." />
          <div className="mt-5 space-y-3"><AddressLink label="Registry" address={VERDICTGRAPH_REGISTRY_ADDRESS} /><AddressLink label="Adjudicator" address={VERDICTGRAPH_ADJUDICATOR_ADDRESS} /><AddressLink label="Vault" address={VERDICTGRAPH_VAULT_ADDRESS} /></div>
          <div className="mt-5 border-t border-white/[.07] pt-4 text-[11px] leading-5 text-zinc-600">Proof Pack digest<br /><span className="font-mono break-all text-zinc-400">{packDigest ?? "Computing…"}</span><br /><span className="text-zinc-700">Digest covers the canonical pack fields and excludes this self-referential field.</span></div>
          <a href={`${BRADBURY_EXPLORER}/address/${VERDICTGRAPH_ADJUDICATOR_ADDRESS}`} target="_blank" rel="noreferrer" className="no-print mt-4 inline-flex items-center gap-2 text-xs text-sky-200/70 hover:text-sky-100">Open Bradbury Explorer <ExternalLink size={12} /></a>
        </section>
      </div>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.018] px-4 py-3 text-xs text-zinc-600"><span>GenLayer snapshot + latest live Vault read · no wallet required to view</span><button onClick={download} className="inline-flex items-center gap-2 text-zinc-300 hover:text-white"><Download size={13} /> Download machine-readable copy</button></div>
    </div>
  );
}

function ProofMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><div className="text-[11px] uppercase tracking-[.14em] text-zinc-600">{label}</div><div className="mt-2 truncate text-sm text-zinc-100">{value}</div><div className="mt-1 truncate text-[11px] text-zinc-600">{detail}</div></div>;
}

function VerificationCheck({ label, good, detail, pending = false }: { label: string; good: boolean; detail: string; pending?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${pending ? "border-sky-300/15 bg-sky-300/[.035]" : good ? "border-emerald-300/15 bg-emerald-300/[.035]" : "border-amber-300/15 bg-amber-300/[.035]"}`}><div className="flex items-center gap-2 text-sm font-medium">{pending ? <Clock3 size={15} className="text-sky-300" /> : good ? <CheckCircle2 size={15} className="text-emerald-300" /> : <CircleAlert size={15} className="text-amber-300" />}{label}</div><div className="mt-2 text-xs leading-5 text-zinc-500">{detail}</div></div>;
}

function SectionHeading({ icon, eyebrow, title, detail }: { icon: React.ReactNode; eyebrow: string; title: string; detail: string }) {
  return <div><div className="flex items-center gap-2 text-xs uppercase tracking-[.17em] text-zinc-600">{icon}{eyebrow}</div><h2 className="mt-2 text-lg font-medium">{title}</h2><p className="mt-2 text-xs leading-5 text-zinc-600">{detail}</p></div>;
}

function HashField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><div className="text-zinc-600">{label}</div><div className={`mt-1 truncate text-zinc-300 ${mono ? "font-mono text-[11px]" : "text-xs"}`} title={value}>{value}</div></div>;
}

function KeyValue({ label, value, block = false }: { label: string; value: string; block?: boolean }) {
  return <div className={`${block ? "block" : "flex items-start justify-between gap-4"} border-b border-white/[.06] pb-3`}><dt className="shrink-0 text-zinc-600">{label}</dt><dd className={`${block ? "mt-2" : "text-right"} max-w-[70%] text-zinc-200`}>{value}</dd></div>;
}

function Note({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><div className="text-xs font-medium text-zinc-300">{title}</div><p className="mt-2 text-xs leading-5 text-zinc-600">{text}</p></div>;
}

function AddressLink({ label, address }: { label: string; address: string }) {
  return <a href={`${BRADBURY_EXPLORER}/address/${address}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-white/[.07] bg-black/20 px-3 py-2.5 text-xs hover:border-white/[.14]"><span className="text-zinc-500">{label}</span><span className="inline-flex min-w-0 items-center gap-2 font-mono text-zinc-300"><span className="truncate">{shortAddress(address, 8)}</span><ExternalLink size={12} className="shrink-0 text-zinc-600" /></span></a>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">{text}</div>;
}
