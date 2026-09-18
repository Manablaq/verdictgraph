"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check, Flag, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { MilestoneConfigurationRequired } from "@/components/milestone-configuration-required";
import { friendlyGenLayerError, isMilestoneConfigured, isUnknownAcceptedProjectError, isTransactionFinalityPendingError, readMilestone, readMilestoneAuthority, waitForFinalized, writeMilestone, type TxHash } from "@/lib/genlayer/client";
import { asNumber, shortAddress } from "@/lib/format";
import { verifyMilestoneTopology } from "@/lib/genlayer/milestone-vault";
import { parseFutureUnix, parsePositiveEther, parsePositiveInteger, validateMilestoneCreate } from "@/lib/milestone-validation";
import { useWallet } from "@/lib/genlayer/wallet-context";
import { clearPendingGenLayerWrite, readPendingGenLayerWrite, savePendingGenLayerWrite, type PendingGenLayerWrite } from "@/lib/genlayer/pending";
import { PendingTransactionNotice } from "@/components/pending-transaction-notice";

type FormState = {
  title: string;
  objective: string;
  projectRef: string;
  criteria: string;
  beneficiary: string;
  principal: string;
  bond: string;
  fundingDeadline: string;
  submissionDeadline: string;
  recoveryDeadline: string;
  challengeWindow: string;
};

type AcceptedProject = { project_ref: string; sponsor: string; baseline_sha256: string; submission_origins_json: string };

const initialForm: FormState = {
  title: "",
  objective: "",
  projectRef: "",
  criteria: "",
  beneficiary: "",
  principal: "0.01",
  bond: "0.002",
  fundingDeadline: "",
  submissionDeadline: "",
  recoveryDeadline: "",
  challengeWindow: "3600",
};

export default function CreateMilestonePage() {
  const router = useRouter();
  const { account, connect } = useWallet();
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const pendingStorageKey = "verdictgraph:milestone:create:pending-genlayer-write";
  const [pendingCreation, setPendingCreation] = useState<PendingGenLayerWrite | null>(() => readPendingGenLayerWrite(pendingStorageKey));
  const configured = isMilestoneConfigured();
  useEffect(() => {
    const projectRef = new URLSearchParams(window.location.search).get("projectRef")?.trim();
    if (projectRef) setForm((current) => ({ ...current, projectRef }));
  }, []);
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
    enabled: configured && projectCount.data !== undefined && projectCount.data > 0n && Boolean(form.projectRef.trim()),
    retry: false,
  });
  const set = (key: keyof FormState) => (value: string) => {
    setErrors([]);
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    if (!configured) return;
    if (!account) {
      await connect();
      return;
    }
    if (projectCount.isError || projectCount.data === undefined) {
      setErrors(["The accepted-project registry could not be read from finalized GenLayer state. Retry the read before creating a milestone."]);
      return;
    }
    if (asNumber(projectCount.data) === 0) {
      setErrors(["Register an accepted project before creating a milestone."]);
      return;
    }
    const validationErrors = validateMilestoneCreate(form, Math.floor(Date.now() / 1_000));
    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }
    if (!acceptedProject.data) {
      setErrors(["The accepted project reference could not be read from finalized GenLayer state."]);
      return;
    }
    if (acceptedProject.data.sponsor.toLowerCase() !== account.toLowerCase()) {
      setErrors(["Only the authority-registered project sponsor can create a milestone for this project."]);
      return;
    }
    setBusy(true);
    try {
      const principal = parsePositiveEther(form.principal, "Principal").value;
      const bond = parsePositiveEther(form.bond, "Beneficiary bond").value;
      const funding = parseFutureUnix(form.fundingDeadline, "Funding deadline", Math.floor(Date.now() / 1_000)).value;
      const submission = parseFutureUnix(form.submissionDeadline, "Submission deadline", Math.floor(Date.now() / 1_000)).value;
      const recovery = parseFutureUnix(form.recoveryDeadline, "Recovery deadline", Math.floor(Date.now() / 1_000)).value;
      const challengeWindow = parsePositiveInteger(form.challengeWindow, "Challenge window").value;
      await verifyMilestoneTopology();
      const milestoneReference = `milestone-${crypto.randomUUID()}`;
      const { hash } = await writeMilestone(account, "create_milestone", [
        form.title.trim(),
        form.objective.trim(),
        form.projectRef.trim(),
        JSON.stringify([{ id: 1, text: form.criteria.trim() }]),
        form.beneficiary.trim(),
        principal,
        bond,
        funding,
        submission,
        recovery,
        challengeWindow,
        milestoneReference,
      ]);
      const pending: PendingGenLayerWrite = { hash, label: "Milestone creation", reference: milestoneReference };
      setPendingCreation(pending);
      savePendingGenLayerWrite(pendingStorageKey, pending);
      toast.message("Milestone creation accepted; waiting for finality…");
      let final;
      try {
        final = await waitForFinalized(hash);
      } catch (error) {
        if (isTransactionFinalityPendingError(error)) return;
        throw error;
      }
      setPendingCreation(null);
      clearPendingGenLayerWrite(pendingStorageKey);
      if (!final.executionSucceeded) throw new Error("Finalized milestone transaction did not finish with return");
      const id = await readMilestone<bigint>("get_milestone_for_reference", [milestoneReference]);
      toast.success(`Milestone #${id.toString()} created`);
      router.push(`/milestones/${id.toString()}`);
    } catch (error) {
      toast.error(friendlyGenLayerError(error, "Milestone creation failed."));
    } finally {
      setBusy(false);
    }
  }

  async function recheckCreation() {
    if (!pendingCreation?.reference) return;
    setBusy(true);
    try {
      const final = await waitForFinalized(pendingCreation.hash as TxHash);
      setPendingCreation(null);
      clearPendingGenLayerWrite(pendingStorageKey);
      if (!final.executionSucceeded) throw new Error("Finalized milestone transaction did not finish with return");
      const id = await readMilestone<bigint>("get_milestone_for_reference", [pendingCreation.reference]);
      toast.success(`Milestone #${id.toString()} created`);
      router.push(`/milestones/${id.toString()}`);
    } catch (error) {
      if (!isTransactionFinalityPendingError(error)) {
        toast.error(friendlyGenLayerError(error, "Could not confirm milestone finality."));
      }
    } finally {
      setBusy(false);
    }
  }

  const content = !configured ? <div className="mt-8"><MilestoneConfigurationRequired /></div> : projectCount.isLoading ? <ReadState>Checking the finalized acceptance registry…</ReadState> : projectCount.isError ? <ReadError message={friendlyGenLayerError(projectCount.error, "The finalized acceptance-registry read failed. Retry before creating a milestone.")} onRetry={() => void projectCount.refetch()} /> : asNumber(projectCount.data) === 0 ? <ProjectPrerequisite /> : acceptedProject.isLoading ? <ReadState>Reading the accepted project trust root…</ReadState> : acceptedProject.isError ? <ReadError message={friendlyGenLayerError(acceptedProject.error, "The finalized accepted-project read failed. Retry before creating a milestone.")} onRetry={() => void acceptedProject.refetch()} /> : !acceptedProject.data ? <ProjectLookup projectRef={form.projectRef} onChange={set("projectRef")} /> : <form onSubmit={submit} className="mt-8 grid gap-5 lg:grid-cols-[1fr_.72fr]"><div className="space-y-4 rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><Field label="Milestone title" value={form.title} onChange={set("title")} placeholder="Verified integration live" /><TextArea label="Objective" value={form.objective} onChange={set("objective")} /><Field label="Accepted project reference" value={form.projectRef} onChange={set("projectRef")} placeholder="verdictgraph-v2" />{acceptedProject.data ? <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.04] p-4 text-xs leading-5 text-emerald-100/70">Accepted project found. Sponsor <span className="break-all font-mono">{acceptedProject.data.sponsor}</span><div className="mt-1 break-all">Baseline {acceptedProject.data.baseline_sha256}</div><div className="mt-3 border-t border-emerald-200/10 pt-3">{!account ? "Connect the registered sponsor wallet before creating this milestone." : account.toLowerCase() === acceptedProject.data.sponsor.toLowerCase() ? "Connected wallet matches the registered sponsor." : <>Switch to the registered sponsor wallet <span className="font-mono">{shortAddress(acceptedProject.data.sponsor)}</span> to create this milestone.</>}</div></div> : null}<TextArea label="Success criterion" value={form.criteria} onChange={set("criteria")} placeholder="The integration is live and independently verifiable." /><Field label="Beneficiary address" value={form.beneficiary} onChange={set("beneficiary")} placeholder="0x…" /><div className="grid gap-4 sm:grid-cols-2"><Field label="Principal (GEN)" value={form.principal} onChange={set("principal")} placeholder="0.01" type="number" min="0" step="any" /><Field label="Beneficiary bond (GEN)" value={form.bond} onChange={set("bond")} placeholder="0.002" type="number" min="0" step="any" /></div><div className="grid gap-4 md:grid-cols-3"><Field label="Funding deadline" value={form.fundingDeadline} onChange={set("fundingDeadline")} type="datetime-local" /><Field label="Submission deadline" value={form.submissionDeadline} onChange={set("submissionDeadline")} type="datetime-local" /><Field label="Recovery deadline" value={form.recoveryDeadline} onChange={set("recoveryDeadline")} type="datetime-local" /></div><Field label="Challenge window (seconds)" value={form.challengeWindow} onChange={set("challengeWindow")} type="number" min="1" step="1" />{errors.length ? <ErrorList errors={errors} /> : null}<button disabled={busy || Boolean(pendingCreation) || Boolean(account && account.toLowerCase() !== acceptedProject.data.sponsor.toLowerCase())} className="inline-flex items-center gap-2 self-start rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}{!account ? "Connect wallet" : account.toLowerCase() === acceptedProject.data.sponsor.toLowerCase() ? "Create and seal milestone" : "Switch to sponsor wallet"}</button></div><aside className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><Flag size={20} className="text-sky-300" /><h2 className="mt-5 font-medium">What becomes fixed</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-500"><li>Authority-registered baseline, acceptance record, and sponsor</li><li>One or more measurable success criteria</li><li>Owner and beneficiary addresses</li><li>Exact principal and bond amounts</li><li>Funding, submission, recovery and challenge windows</li><li>PASS, FAIL and UNDETERMINED settlement rules</li></ul><Link href="/milestones/authority" className="mt-6 inline-flex text-xs text-sky-200/80 hover:text-sky-100">Register or inspect an accepted project →</Link><p className="mt-4 text-xs leading-5 text-zinc-700">GenLayer validators independently retrieve hash-pinned documents as base64-isolated evidence and never treat their contents as instructions.</p></aside></form>;

  return <AppShell>
    <Link href="/milestones" className="inline-flex items-center gap-2 text-sm text-zinc-500">← Milestones</Link>
    <div className="mt-6 max-w-4xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Create a commitment</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Lock the accepted project before work starts.</h1><p className="mt-3 text-sm leading-6 text-zinc-500">The acceptance authority pre-registers the project baseline and authorized sponsor. Only that sponsor can create a milestone; the baseline cannot be replaced by a client-side URL or digest.</p></div>
    {pendingCreation ? <PendingTransactionNotice label={pendingCreation.label} hash={pendingCreation.hash} busy={busy} onRecheck={() => void recheckCreation()} /> : null}
    {content}
  </AppShell>;
}

function ReadState({ children }: { children: string }) {
  return <div className="mt-8 rounded-[28px] border border-white/[.08] bg-white/[.02] p-8 text-sm text-zinc-500" role="status" aria-live="polite">{children}</div>;
}

function ReadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const safeMessage = message.length > 240 || /ReturnData|execution failed|genvm\.VMResult/i.test(message) ? "The finalized GenLayer read failed. Retry the read before continuing." : message;
  return <div className="mt-8 rounded-[28px] border border-rose-400/15 bg-rose-400/[.04] p-7 text-sm text-rose-200" role="alert"><h2 className="font-medium">Could not read the finalized acceptance state.</h2><p className="mt-2 break-words text-rose-100/70">{safeMessage}</p><button type="button" onClick={onRetry} className="mt-5 rounded-full bg-white px-4 py-2.5 text-xs font-medium text-black">Retry read</button></div>;
}

function ProjectPrerequisite() {
  return <div className="mt-8 rounded-[28px] border border-amber-300/15 bg-amber-300/[.035] p-8" role="status"><h2 className="text-lg font-semibold text-amber-100">An accepted project is required first.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">The acceptance authority has not registered a trust root yet. Register the exact baseline, acceptance record, mirrors, and sponsor on Bradbury before creating a milestone.</p><Link href="/milestones/authority" className="mt-6 inline-flex items-center rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black">Open acceptance authority →</Link></div>;
}

function ProjectLookup({ projectRef, onChange }: { projectRef: string; onChange: (value: string) => void }) {
  return <div className="mt-8 max-w-2xl rounded-[28px] border border-amber-300/15 bg-amber-300/[.035] p-8" role="status"><h2 className="text-lg font-semibold text-amber-100">Accepted project not found.</h2><p className="mt-3 text-sm leading-6 text-zinc-400">Change the reference to one of the authority’s finalized trust roots, or inspect the authority page to register a new one.</p><div className="mt-6"><Field label="Accepted project reference" value={projectRef} onChange={onChange} placeholder="verdictgraph" /></div><Link href="/milestones/authority" className="mt-6 inline-flex items-center text-sm text-sky-200/80 hover:text-sky-100">Open acceptance authority →</Link></div>;
}

function Field({ label, value, onChange, placeholder, type = "text", min, step }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; min?: string; step?: string }) {
  return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><input required type={type} min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20" /></label>;
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><textarea required rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-3 text-sm leading-6 outline-none focus:border-white/20" /></label>;
}

function ErrorList({ errors }: { errors: string[] }) {
  return <ul role="alert" className="rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-4 text-xs leading-5 text-rose-200">{errors.map((error) => <li key={error}>{error}</li>)}</ul>;
}
