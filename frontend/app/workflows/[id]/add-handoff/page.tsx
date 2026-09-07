"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, GitCommitHorizontal, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { parseEther } from "viem";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  isProtocolConfigured,
  readRegistry,
  writeRegistry,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";

function unix(value: string) { return BigInt(Math.floor(new Date(value).getTime() / 1000)); }

type Criterion = { id: string; text: string; faultClass: string; consequence: string };
const initialCriterion = (): Criterion => ({ id: "1", text: "Do not certify an opportunity whose deadline is already closed.", faultClass: "VERIFICATION_FAILURE", consequence: "2" });

export default function AddHandoffPage() {
  const params = useParams<{ id: string }>();
  const workflowId = BigInt(params.id);
  const router = useRouter();
  const { account, connect } = useWallet();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ requester: "", provider: "", responsibility: "Verify that every listed opportunity is eligible and open at the observation time.", principal: "0.01", bond: "0.002", funding: "", deadline: "", recovery: "" });
  const [criteria, setCriteria] = useState<Criterion[]>([initialCriterion()]);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const patchCriterion = (index: number, patch: Partial<Criterion>) => setCriteria((current) => current.map((criterion, i) => i === index ? { ...criterion, ...patch } : criterion));

  function addCriterion() {
    setCriteria((current) => [...current, { id: String(current.length + 1), text: "", faultClass: "INCOMPLETE_DELIVERY", consequence: "2" }]);
  }

  function removeCriterion(index: number) {
    setCriteria((current) => current.length === 1 ? current : current.filter((_, i) => i !== index));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isProtocolConfigured()) return;
    if (!account) { await connect(); return; }
    const normalized = criteria.map((criterion) => ({
      id: Number(criterion.id),
      text: criterion.text.trim(),
      fault_class: criterion.faultClass,
      consequence_rule_id: Number(criterion.consequence),
    }));
    if (new Set(normalized.map((criterion) => criterion.id)).size !== normalized.length) { toast.error("Criterion rule IDs must be unique within a handoff"); return; }
    if (normalized.some((criterion) => !Number.isInteger(criterion.id) || criterion.id <= 0 || !criterion.text)) { toast.error("Every criterion needs a positive integer rule ID and non-empty text"); return; }
    setBusy(true);
    try {
      await writeRegistry(account, "add_handoff", [workflowId, form.requester, form.provider, form.responsibility, JSON.stringify(normalized), parseEther(form.principal), parseEther(form.bond), unix(form.funding), unix(form.deadline), unix(form.recovery)]);
      const id = await readRegistry<bigint>("get_latest_handoff_for_workflow", [workflowId], "accepted");
      toast.success(`Handoff #${id.toString()} accepted`);
      router.push(`/workflows/${params.id}?state=accepted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Handoff creation failed");
    } finally {
      setBusy(false);
    }
  }

  return <AppShell>
    <Link href={`/workflows/${params.id}?state=accepted`} className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft size={14}/> Workflow #{params.id}</Link>
    <div className="mt-6 max-w-4xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Responsibility boundary</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Add a handoff.</h1><p className="mt-3 text-sm leading-6 text-zinc-500">Register the responsibility boundary and every material breach criterion before activation. The semantic verdict chooses an exact registered rule; it never invents payout math.</p></div>
    <form onSubmit={submit} className="mt-8 max-w-4xl space-y-5 rounded-[28px] border border-white/[.08] bg-white/[.02] p-6">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Requester" value={form.requester} onChange={(value) => set("requester", value)} placeholder="0x…"/><Field label="Provider" value={form.provider} onChange={(value) => set("provider", value)} placeholder="0x…"/></div>
      <Area label="Responsibility" value={form.responsibility} onChange={(value) => set("responsibility", value)}/>
      <section className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-[.15em] text-zinc-600">Breach criteria</div><p className="mt-1 text-xs text-zinc-700">Each rule ID must be unique. V1 supports a bounded set and the contract validates the exact registered consequence.</p></div><button type="button" onClick={addCriterion} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300"><Plus size={13}/> Add rule</button></div>
        <div className="mt-4 space-y-4">{criteria.map((criterion, index) => <div key={index} className="rounded-2xl border border-white/[.07] bg-white/[.015] p-4"><div className="flex items-center justify-between"><span className="text-xs text-zinc-600">Criterion {index + 1}</span><button type="button" disabled={criteria.length === 1} onClick={() => removeCriterion(index)} className="rounded-full p-2 text-zinc-600 hover:bg-white/[.04] hover:text-rose-300 disabled:opacity-20"><Trash2 size={14}/></button></div><div className="mt-3 grid gap-4 sm:grid-cols-[.3fr_1.7fr]"><Field label="Rule ID" value={criterion.id} onChange={(value) => patchCriterion(index, { id: value })}/><Field label="Criterion" value={criterion.text} onChange={(value) => patchCriterion(index, { text: value })}/></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Select label="Fault class" value={criterion.faultClass} onChange={(value) => patchCriterion(index, { faultClass: value })}><option>VERIFICATION_FAILURE</option><option>INCOMPLETE_DELIVERY</option><option>INCORRECT_DELIVERY</option><option>MISSED_DEADLINE</option><option>SOURCE_FAILURE</option><option>POLICY_BREACH</option><option>MISUSE_OF_VALID_INPUT</option><option>OTHER_MATERIAL_BREACH</option></Select><Select label="Deterministic consequence" value={criterion.consequence} onChange={(value) => patchCriterion(index, { consequence: value })}><option value="2">2 — Provider breach: requester receives principal + bond</option><option value="3">3 — Neutral recovery: principal refunded, bond returned</option></Select></div></div>)}</div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Principal (GEN)" value={form.principal} onChange={(value) => set("principal", value)}/><Field label="Provider bond (GEN)" value={form.bond} onChange={(value) => set("bond", value)}/></div>
      <div className="grid gap-4 md:grid-cols-3"><DateField label="Funding deadline" value={form.funding} onChange={(value) => set("funding", value)}/><DateField label="Delivery deadline" value={form.deadline} onChange={(value) => set("deadline", value)}/><DateField label="Recovery deadline" value={form.recovery} onChange={(value) => set("recovery", value)}/></div>
      <button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={15}/> : <GitCommitHorizontal size={15}/>} {account ? "Register handoff" : "Connect wallet"}</button>
    </form>
  </AppShell>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20"/></label>; }
function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><textarea required rows={3} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20"/></label>; }
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><input required type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20"/></label>; }
function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/[.09] bg-[#090c11] px-3 py-2.5 text-sm">{children}</select></label>; }
