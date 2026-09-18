"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileCheck2, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { FileHashHelper } from "@/components/file-hash-helper";
import { MilestoneConfigurationRequired } from "@/components/milestone-configuration-required";
import { friendlyGenLayerError, getMilestoneAuthorityAddress, getMilestoneRegistryAddress, isMilestoneConfigured, isUnknownAcceptedProjectError, isTransactionFinalityPendingError, readMilestoneAuthority, waitForFinalized, writeMilestoneAuthority, type TxHash } from "@/lib/genlayer/client";
import { verifyMilestoneTopology } from "@/lib/genlayer/milestone-vault";
import { preflightAcceptedProjectDocuments, validateAcceptedProject } from "@/lib/milestone-validation";
import { useWallet } from "@/lib/genlayer/wallet-context";
import { clearPendingGenLayerWrite, readPendingGenLayerWrite, savePendingGenLayerWrite, type PendingGenLayerWrite } from "@/lib/genlayer/pending";
import { PendingTransactionNotice } from "@/components/pending-transaction-notice";

type FormState = {
  projectRef: string;
  sponsor: string;
  baselineUri: string;
  baselineSha: string;
  baselineMirrorUri: string;
  acceptanceRecordUri: string;
  acceptanceRecordSha: string;
  acceptanceRecordMirrorUri: string;
};

type AcceptedProject = {
  project_ref: string;
  sponsor: string;
  baseline_uri: string;
  baseline_sha256: string;
  baseline_mirror_uri: string;
  acceptance_record_uri: string;
  acceptance_record_sha256: string;
  acceptance_record_mirror_uri: string;
  submission_origins_json: string;
  registered_at: string;
};

const initialForm: FormState = {
  projectRef: "",
  sponsor: "",
  baselineUri: "",
  baselineSha: "",
  baselineMirrorUri: "",
  acceptanceRecordUri: "",
  acceptanceRecordSha: "",
  acceptanceRecordMirrorUri: "",
};

export default function MilestoneAuthorityPage() {
  const { account, connect } = useWallet();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const pendingStorageKey = "verdictgraph:milestone:authority:pending-genlayer-write";
  const [pendingRegistration, setPendingRegistration] = useState<PendingGenLayerWrite | null>(() => readPendingGenLayerWrite(pendingStorageKey));
  const configured = isMilestoneConfigured();
  const authority = useQuery({
    queryKey: ["milestone-acceptance-authority"],
    queryFn: () => readMilestoneAuthority<string>("get_acceptance_authority"),
    enabled: configured,
  });
  const projectCount = useQuery({
    queryKey: ["milestone-accepted-project-count"],
    queryFn: () => readMilestoneAuthority<bigint>("get_project_count"),
    enabled: configured,
  });
  const acceptedProject = useQuery({
    queryKey: ["milestone-accepted-project", form.projectRef.trim()],
    queryFn: async () => {
      try {
        return await readMilestoneAuthority<AcceptedProject>("get_accepted_project", [form.projectRef.trim()]);
      } catch (error) {
        if (isUnknownAcceptedProjectError(error)) return null;
        throw error;
      }
    },
    enabled: configured && !pendingRegistration && projectCount.data !== undefined && projectCount.data > 0n && Boolean(form.projectRef.trim()),
    retry: false,
  });
  const set = (key: keyof FormState) => (value: string) => {
    setErrors([]);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const isAuthority = Boolean(account && authority.data && account.toLowerCase() === authority.data.toLowerCase());
  const visibleAcceptedProject = pendingRegistration ? null : acceptedProject.data;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    if (!configured) return;
    if (!account) {
      await connect();
      return;
    }
    if (!isAuthority) {
      toast.error("Connect the configured acceptance authority wallet to register a project.");
      return;
    }
    const validationErrors = validateAcceptedProject(form);
    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }
    const documentErrors = await preflightAcceptedProjectDocuments(form);
    if (documentErrors.length) {
      setErrors(documentErrors);
      return;
    }
    setBusy(true);
    try {
      await verifyMilestoneTopology();
      const { hash } = await writeMilestoneAuthority(account, "register_accepted_project", [
        form.projectRef.trim(),
        form.sponsor.trim(),
        form.baselineUri.trim(),
        form.baselineSha.trim(),
        form.baselineMirrorUri.trim(),
        form.acceptanceRecordUri.trim(),
        form.acceptanceRecordSha.trim(),
        form.acceptanceRecordMirrorUri.trim(),
      ]);
      const pending: PendingGenLayerWrite = { hash, label: "Accepted project registration", reference: form.projectRef.trim() };
      setPendingRegistration(pending);
      savePendingGenLayerWrite(pendingStorageKey, pending);
      toast.message("Accepted project registration submitted; waiting for finality…");
      let final;
      try {
        final = await waitForFinalized(hash);
      } catch (error) {
        if (isTransactionFinalityPendingError(error)) return;
        throw error;
      }
      const projectRef = form.projectRef.trim();
      setPendingRegistration(null);
      clearPendingGenLayerWrite(pendingStorageKey);
      if (!final.executionSucceeded) throw new Error("Finalized registration did not finish with return");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["milestone-accepted-project-count"] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-accepted-project", projectRef] }),
        queryClient.invalidateQueries({ queryKey: ["milestones"] }),
      ]);
      toast.success("Accepted project is now an on-chain milestone trust root");
    } catch (error) {
      toast.error(friendlyGenLayerError(error, "Accepted project registration failed."));
    } finally {
      setBusy(false);
    }
  }

  async function recheckRegistration() {
    if (!pendingRegistration) return;
    setBusy(true);
    try {
      const final = await waitForFinalized(pendingRegistration.hash as TxHash);
      setPendingRegistration(null);
      clearPendingGenLayerWrite(pendingStorageKey);
      if (!final.executionSucceeded) throw new Error("Finalized registration did not finish with return");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["milestone-accepted-project-count"] }),
        queryClient.invalidateQueries({ queryKey: ["milestone-accepted-project", pendingRegistration.reference] }),
        queryClient.invalidateQueries({ queryKey: ["milestones"] }),
      ]);
      toast.success("Accepted project registration is now finalized");
    } catch (error) {
      if (!isTransactionFinalityPendingError(error)) {
        toast.error(friendlyGenLayerError(error, "Could not confirm registration finality."));
      }
    } finally {
      setBusy(false);
    }
  }

  return <AppShell>
    <Link href="/milestones" className="inline-flex items-center gap-2 text-sm text-zinc-500">← Milestones</Link>
    <div className="mt-6 max-w-4xl">
      <div className="text-xs uppercase tracking-[.2em] text-zinc-600">Acceptance authority</div>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Register the project trust root.</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-500">The authority binds a project to its accepted baseline, acceptance record, and authorized sponsor. Only that sponsor can create milestones for the project.</p>
    </div>
    {pendingRegistration ? <PendingTransactionNotice label={pendingRegistration.label} hash={pendingRegistration.hash} busy={busy} onRecheck={() => void recheckRegistration()} /> : null}
    {!configured ? <div className="mt-8"><MilestoneConfigurationRequired /></div> : <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_.72fr]">
      <form onSubmit={submit} className="space-y-4 rounded-[28px] border border-white/[.08] bg-white/[.02] p-6">
        <div className="rounded-2xl border border-sky-300/15 bg-sky-300/[.04] p-4 text-xs leading-5 text-sky-100/70">
          <div className="flex items-center gap-2 text-sm text-sky-100"><ShieldCheck size={15} /> On-chain authority check</div>
          <div className="mt-2 break-all font-mono">{authority.isLoading ? "Reading authority…" : authority.isError ? "Authority read failed" : authority.data ?? "Authority unavailable"}</div>
          {authority.isError ? <div className="mt-2 break-words text-rose-200/80">{friendlyGenLayerError(authority.error, "Retry the finalized authority read before registering.")}</div> : null}
          <div className="mt-2">{account ? (isAuthority ? "Connected wallet may register projects." : "Connected wallet is not the configured authority.") : "Connect a wallet to compare it with the authority."}</div>
        </div>
        {projectCount.isError ? <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-4 text-xs leading-5 text-rose-200" role="alert">Could not read the accepted-project count from finalized GenLayer state: {friendlyGenLayerError(projectCount.error, "Retry the finalized project-count read before registering.")}</div> : null}
        <Field label="Project reference" value={form.projectRef} onChange={set("projectRef")} placeholder="verdictgraph-v2" />
        {visibleAcceptedProject ? <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.04] p-4 text-xs leading-5 text-emerald-100/70">Registered project <span className="font-mono">{visibleAcceptedProject.project_ref}</span><div className="mt-2">Sponsor <span className="break-all font-mono">{visibleAcceptedProject.sponsor}</span></div><div className="mt-2 break-all">Baseline {visibleAcceptedProject.baseline_sha256}</div><div className="mt-1 break-all">Acceptance record {visibleAcceptedProject.acceptance_record_sha256}</div><div className="mt-3 border-t border-emerald-200/10 pt-3">This registers the project trust root only. It does not create a milestone.</div><Link href={`/milestones/create?projectRef=${encodeURIComponent(visibleAcceptedProject.project_ref)}`} className="mt-3 inline-flex items-center rounded-full bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-950">Create a milestone for this project →</Link></div> : pendingRegistration ? <div className="text-xs text-amber-100/60">Registration is accepted but not finalized yet. The project will be shown here after Bradbury finality.</div> : acceptedProject.isFetching ? <div className="text-xs text-zinc-600">Inspecting accepted project…</div> : acceptedProject.isError ? <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-4 text-xs leading-5 text-rose-200" role="alert">Could not inspect this accepted project: {friendlyGenLayerError(acceptedProject.error, "Retry the finalized accepted-project read.")}</div> : null}
        <Field label="Authorized project sponsor address" value={form.sponsor} onChange={set("sponsor")} placeholder="0x…" />
        <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4 text-xs leading-5 text-amber-100/70">Before the wallet transaction, the app fetches both copies, verifies their exact SHA-256 bytes, checks that they are identical valid UTF-8 text, and rejects binary archives or oversized documents.</div>
        <Field label="Accepted baseline HTTPS URI" value={form.baselineUri} onChange={set("baselineUri")} placeholder="https://…" />
        <Field label="Baseline SHA-256" value={form.baselineSha} onChange={set("baselineSha")} placeholder="64 lowercase hex characters" />
        <FileHashHelper onHash={set("baselineSha")} />
        <Field label="Accepted baseline mirror HTTPS URI" value={form.baselineMirrorUri} onChange={set("baselineMirrorUri")} placeholder="https://durable-mirror.example/…" />
        <Field label="Acceptance record HTTPS URI" value={form.acceptanceRecordUri} onChange={set("acceptanceRecordUri")} placeholder="https://…" />
        <Field label="Acceptance record SHA-256" value={form.acceptanceRecordSha} onChange={set("acceptanceRecordSha")} placeholder="64 lowercase hex characters" />
        <FileHashHelper onHash={set("acceptanceRecordSha")} />
        <Field label="Acceptance record mirror HTTPS URI" value={form.acceptanceRecordMirrorUri} onChange={set("acceptanceRecordMirrorUri")} placeholder="https://durable-mirror.example/…" />
        {errors.length ? <ErrorList errors={errors} /> : null}
        <button disabled={busy || Boolean(pendingRegistration) || !isAuthority || Boolean(visibleAcceptedProject)} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}{visibleAcceptedProject ? "Project already registered" : "Register accepted project"}</button>
      </form>
      <aside className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><FileCheck2 size={20} className="text-emerald-300" /><h2 className="mt-5 font-medium">A sponsor-bound trust root</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-500"><li>Only the constructor-selected authority can register a project.</li><li>The authority records the exact sponsor permitted to create milestones.</li><li>Each project reference is write-once.</li><li>Every milestone inherits the registered baseline and acceptance record.</li></ul><p className="mt-6 text-xs leading-5 text-zinc-700">Hashes prove byte identity. The authority and sponsor addresses establish who is authorized, but do not independently prove an off-chain claim is true.</p><div className="mt-6 space-y-1 break-all text-[11px] text-zinc-700"><div>Authority {getMilestoneAuthorityAddress() ?? "not configured"}</div><div>Registry {getMilestoneRegistryAddress() ?? "not configured"}</div></div></aside>
    </div>}
  </AppShell>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20" /></label>;
}

function ErrorList({ errors }: { errors: string[] }) {
  return <ul role="alert" className="rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-4 text-xs leading-5 text-rose-200">{errors.map((error) => <li key={error}>{error}</li>)}</ul>;
}
