"use client";

import { Suspense, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Fingerprint, LoaderCircle, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import { FileHashHelper } from "@/components/file-hash-helper";
import { SnapshotNotice } from "@/components/snapshot-notice";
import { getCoreAddress, readCore, writeCore } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";
import { asNumber, shortAddress } from "@/lib/format";
import type { CaseRecord, EvidencePolicyRecord, EvidenceRecord, WorkflowRecord } from "@/lib/types";

function unix(value: string) { return BigInt(Math.floor(new Date(value).getTime() / 1000)); }
function localDate(secondsFromNow: number) { const date = new Date(Date.now() + secondsFromNow * 1000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0,16); }

type Authority = { policy: EvidencePolicyRecord; issuers: string[]; publishers: string[] };

export default function RegisterEvidencePage() {
  return (
    <Suspense fallback={<AppShell><div className="text-sm text-zinc-600">Loading evidence form…</div></AppShell>}>
      <RegisterEvidenceContent />
    </Suspense>
  );
}

function RegisterEvidenceContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const caseId = Number(params.id);
  const stateStatus: "accepted" | "finalized" = search.get("state") === "accepted" ? "accepted" : "finalized";
  const repairEvidenceId = Number(search.get("repairEvidenceId") ?? "0");
  const { account, connect } = useWallet();
  const configured = Boolean(getCoreAddress());
  const [busy, setBusy] = useState(false);
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [repairRecord, setRepairRecord] = useState<EvidenceRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ stableId: "", publisher: "", uri: "https://", sha: "", version: "1", issuedAt: localDate(-300), observedAt: localDate(-60), expiresAt: localDate(86400), group: `case-${caseId}-fact-1` });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!configured || !Number.isInteger(caseId) || caseId <= 0) return;
    (async () => {
      try {
        const c = await readCore<CaseRecord>("get_case", [BigInt(caseId)], stateStatus);
        const workflow = await readCore<WorkflowRecord>("get_workflow", [c.workflow_id], stateStatus);
        const policy = await readCore<EvidencePolicyRecord>("get_policy", [workflow.policy_id], stateStatus);
        const issuers = await Promise.all(Array.from({ length: asNumber(policy.issuer_count) }, (_, i) => readCore<string>("get_policy_issuer", [workflow.policy_id, BigInt(i)], stateStatus)));
        const publishers = await Promise.all(Array.from({ length: asNumber(policy.publisher_count) }, (_, i) => readCore<string>("get_policy_publisher", [workflow.policy_id, BigInt(i)], stateStatus)));
        setAuthority({ policy, issuers, publishers });
        if (repairEvidenceId > 0) {
          const prior = await readCore<EvidenceRecord>("get_evidence", [BigInt(repairEvidenceId)], stateStatus);
          if (asNumber(prior.case_id) !== caseId) throw new Error("Repair evidence does not belong to this case");
          setRepairRecord(prior);
          setForm((current) => ({
            ...current,
            stableId: prior.stable_record_id,
            publisher: prior.publisher_prefix,
            uri: prior.source_uri,
            sha: prior.expected_sha256,
            version: String(asNumber(prior.version) + 1),
            group: prior.corroboration_group,
          }));
        } else if (publishers[0]) {
          setForm((current) => ({ ...current, publisher: publishers[0], uri: publishers[0] }));
        }
      } catch (e) { setError(e instanceof Error ? e.message : "Unable to load policy authority"); }
    })();
  }, [caseId, configured, repairEvidenceId, stateStatus]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account) { await connect(); return; }
    setBusy(true);
    try {
      await writeCore(account, "register_evidence", [BigInt(caseId), form.stableId, form.publisher, form.uri, form.sha.toLowerCase(), BigInt(form.version), unix(form.issuedAt), unix(form.observedAt), unix(form.expiresAt), form.group]);
      toast.success("Evidence record accepted");
      router.push(`/cases/${caseId}?state=accepted`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Evidence registration failed"); }
    finally { setBusy(false); }
  }

  const approved = Boolean(account && authority?.issuers.some((value) => value.toLowerCase() === account.toLowerCase()));
  return <AppShell>
    <Link href={`/cases/${caseId}${stateStatus === "accepted" ? "?state=accepted" : ""}`} className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft size={14}/> Case #{caseId}</Link>
    <div className="mt-4"><SnapshotNotice state={stateStatus}/></div>
    <div className="mt-6 max-w-3xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Authenticated evidence</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">{repairEvidenceId > 0 ? "Repair the failed source record." : "Register a source record."}</h1><p className="mt-3 text-sm leading-6 text-zinc-500">Your wallet is the issuer identity. The source must stay inside one of the sealed policy's approved publisher prefixes and must satisfy freshness, expiry and anti-reuse rules.</p>{repairRecord ? <div className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[.025] p-4 text-xs leading-5 text-amber-100/70">Repairing evidence #{repairEvidenceId}. The stable record ID is preserved, the version must increase, and the same authenticated issuer must submit the replacement. The previous record remains queryable.</div> : null}</div>
    {!configured ? <div className="mt-7"><ConfigurationRequired/></div> : error ? <div className="mt-7 rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-5 text-sm text-rose-200">{error}</div> : !authority ? <div className="mt-7 text-sm text-zinc-600">Loading policy authority…</div> : <div className="mt-8 grid max-w-5xl gap-5 lg:grid-cols-[1fr_.62fr]">
      <form onSubmit={submit} className="space-y-4 rounded-[28px] border border-white/[.08] bg-white/[.02] p-6">
        <div className="grid gap-4 md:grid-cols-2"><Field label="Stable evidence ID" value={form.stableId} onChange={(v)=>set("stableId",v)} placeholder="invoice-2026-09-001"/><Field label="Version" value={form.version} onChange={(v)=>set("version",v)} type="number"/></div>
        <label className="block"><span className="mb-2 block text-xs text-zinc-500">Approved publisher boundary</span><select required value={form.publisher} onChange={(e)=>{set("publisher",e.target.value); if(!form.uri.startsWith(e.target.value)) set("uri",e.target.value)}} className="w-full rounded-xl border border-white/[.09] bg-[#090c11] px-3 py-2.5 text-sm">{authority.publishers.map((p)=><option key={p}>{p}</option>)}</select></label>
        <Field label="Immutable/versioned HTTPS source URI" value={form.uri} onChange={(v)=>set("uri",v)} placeholder="https://…"/>
        <Field label="Expected SHA-256" value={form.sha} onChange={(v)=>set("sha",v)} placeholder="64 lowercase hexadecimal characters" mono/>
        <FileHashHelper onHash={(value) => set("sha", value)} />
        <div className="grid gap-4 md:grid-cols-3"><Field label="Issued at" value={form.issuedAt} onChange={(v)=>set("issuedAt",v)} type="datetime-local"/><Field label="Observed at" value={form.observedAt} onChange={(v)=>set("observedAt",v)} type="datetime-local"/><Field label="Expires at" value={form.expiresAt} onChange={(v)=>set("expiresAt",v)} type="datetime-local"/></div>
        <Field label="Corroboration group" value={form.group} onChange={(v)=>set("group",v)}/>
        {!approved && account ? <div className="rounded-xl border border-amber-300/15 bg-amber-300/[.04] p-3 text-xs text-amber-100/80">Connected wallet {shortAddress(account)} is not one of this policy's approved issuer identities. The contract will reject its evidence.</div> : null}
        <button disabled={busy || Boolean(account && !approved)} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40">{busy ? <LoaderCircle size={15} className="animate-spin"/> : <ShieldPlus size={15}/>} {account ? "Register evidence" : "Connect wallet"}</button>
      </form>
      <aside className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><Fingerprint size={19} className="text-emerald-300"/><h2 className="mt-4 font-medium">Sealed authority</h2><div className="mt-5 text-xs text-zinc-600">Policy fingerprint</div><div className="mt-1 break-all font-mono text-[11px] text-zinc-400">{authority.policy.fingerprint_sha256}</div><div className="mt-5 text-xs text-zinc-600">Approved issuers</div><div className="mt-2 space-y-2">{authority.issuers.map((a)=><div key={a} className="rounded-xl border border-white/[.06] px-3 py-2 font-mono text-[11px] text-zinc-400">{shortAddress(a,8)}</div>)}</div><div className="mt-5 text-xs text-zinc-600">Required at review</div><p className="mt-2 text-sm leading-6 text-zinc-400">{asNumber(authority.policy.minimum_distinct_issuers)} distinct issuers and {asNumber(authority.policy.minimum_distinct_publishers)} distinct publisher boundaries, with distinct content digests.</p></aside>
    </div>}
  </AppShell>;
}

function Field({ label, value, onChange, placeholder, mono = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; mono?: boolean; type?: string }) { return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><input required type={type} value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className={`w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20 ${mono ? "font-mono" : ""}`}/></label>; }
