"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import {
  isProtocolConfigured,
  readRegistry,
  writeRegistry,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";

function seconds(value: string) { return BigInt(Math.max(1, Number(value || 0))); }

export default function CreatePolicyPage() {
  const router = useRouter();
  const { account, connect } = useWallet();
  const configured = Boolean(isProtocolConfigured());
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("Ready");
  const [form, setForm] = useState({
    title: "Production workflow evidence policy",
    issuer1: "", issuer2: "", publisher1: "https://", publisher2: "https://",
    maxAge: "86400", minValidity: "3600", response: "3600", repair: "7200", recovery: "86400",
  });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured) return;
    if (!account) { await connect(); return; }
    setBusy(true);
    try {
      setStep("Creating policy");
      await writeRegistry(account, "create_evidence_policy", [form.title, 1n, seconds(form.maxAge), seconds(form.minValidity), 2n, 2n, seconds(form.response), seconds(form.repair), seconds(form.recovery)]);
      const policyId = await readRegistry<bigint>("get_latest_policy_for_owner", [account], "accepted");
      setStep("Binding issuer identities");
      await writeRegistry(account, "add_policy_issuer", [policyId, form.issuer1]);
      await writeRegistry(account, "add_policy_issuer", [policyId, form.issuer2]);
      setStep("Binding publisher boundaries");
      await writeRegistry(account, "add_policy_publisher", [policyId, form.publisher1]);
      await writeRegistry(account, "add_policy_publisher", [policyId, form.publisher2]);
      setStep("Sealing policy fingerprint");
      await writeRegistry(account, "seal_evidence_policy", [policyId]);
      toast.success(`Policy #${policyId.toString()} accepted and sealed`);
      router.push(`/create/workflow?policy=${policyId.toString()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Policy creation failed");
    } finally { setBusy(false); setStep("Ready"); }
  }

  return <AppShell><Link href="/create" className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft size={14}/> Create</Link><div className="mt-6 max-w-4xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Evidence authority</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Seal the policy.</h1><p className="mt-3 text-sm leading-6 text-zinc-500">V1 intentionally requires at least two distinct approved issuer addresses and two approved publisher boundaries.</p></div>{!configured ? <div className="mt-7"><ConfigurationRequired/></div> : <form onSubmit={submit} className="mt-8 grid gap-5 lg:grid-cols-[1fr_.72fr]"><div className="space-y-4 rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><Field label="Policy title" value={form.title} onChange={(v)=>set("title",v)}/><div className="grid gap-4 md:grid-cols-2"><Field label="Approved issuer #1" value={form.issuer1} onChange={(v)=>set("issuer1",v)} placeholder="0x…"/><Field label="Approved issuer #2" value={form.issuer2} onChange={(v)=>set("issuer2",v)} placeholder="0x…"/><Field label="Publisher boundary #1" value={form.publisher1} onChange={(v)=>set("publisher1",v)} placeholder="https://authority.example/"/><Field label="Publisher boundary #2" value={form.publisher2} onChange={(v)=>set("publisher2",v)} placeholder="https://archive.example/"/></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Max evidence age (s)" value={form.maxAge} onChange={(v)=>set("maxAge",v)}/><Field label="Min remaining validity (s)" value={form.minValidity} onChange={(v)=>set("minValidity",v)}/><Field label="Response window (s)" value={form.response} onChange={(v)=>set("response",v)}/><Field label="Repair window (s)" value={form.repair} onChange={(v)=>set("repair",v)}/><Field label="Recovery horizon (s)" value={form.recovery} onChange={(v)=>set("recovery",v)}/></div><button disabled={busy} className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin"/> : <Check size={15}/>} {account ? "Create and seal policy" : "Connect wallet"}</button>{busy ? <p className="text-xs text-sky-300">{step}…</p> : null}</div><aside className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><ShieldCheck size={20} className="text-emerald-300"/><h2 className="mt-5 font-medium">What gets frozen</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-500"><li>Issuer wallet identities</li><li>Publisher URL boundaries</li><li>Freshness and expiry rules</li><li>2-of-2 minimum independent authority classes</li><li>Response, repair and recovery timing</li></ul><p className="mt-6 text-xs leading-5 text-zinc-700">The fingerprint proves configuration identity. It does not prove that two issuer addresses are economically independent; that remains an explicit integrator trust assumption.</p></aside></form>}</AppShell>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><input required value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-800 focus:border-white/20"/></label>;
}
