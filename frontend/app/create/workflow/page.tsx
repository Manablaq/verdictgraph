"use client";

import { Suspense, FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GitFork, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import {
  isProtocolConfigured,
  readRegistry,
  writeRegistry,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";

export default function CreateWorkflowPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-sm text-zinc-600">Loading workflow builder…</div></AppShell>}>
      <CreateWorkflowContent />
    </Suspense>
  );
}

function CreateWorkflowContent() {
  const router = useRouter(); const params = useSearchParams(); const { account, connect } = useWallet();
  const [busy,setBusy]=useState(false); const [title,setTitle]=useState("Grant verification pipeline"); const [mission,setMission]=useState("Research, verify and publish only currently eligible grant opportunities."); const [policy,setPolicy]=useState(params.get("policy") ?? "1"); const [deadline,setDeadline]=useState("");
  async function submit(e:FormEvent){e.preventDefault(); if(!isProtocolConfigured())return; if(!account){await connect();return;} setBusy(true); try{const unix=BigInt(Math.floor(new Date(deadline).getTime()/1000)); await writeRegistry(account,"create_workflow",[title,mission,BigInt(policy),unix]); const id=await readRegistry<bigint>("get_latest_workflow_for_owner",[account],"accepted"); toast.success(`Workflow #${id.toString()} accepted`); router.push(`/workflows/${id.toString()}/add-handoff?state=accepted`);}catch(error){toast.error(error instanceof Error?error.message:"Workflow creation failed");}finally{setBusy(false)}}
  return <AppShell><Link href="/create" className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft size={14}/> Create</Link><div className="mt-6 max-w-3xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Workflow</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Create the graph container.</h1></div>{!isProtocolConfigured()?<div className="mt-7"><ConfigurationRequired/></div>:<form onSubmit={submit} className="mt-8 max-w-3xl space-y-4 rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><Field label="Title" value={title} onChange={setTitle}/><label className="block"><span className="mb-2 block text-xs text-zinc-500">Mission</span><textarea required value={mission} onChange={(e)=>setMission(e.target.value)} rows={4} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20"/></label><div className="grid gap-4 sm:grid-cols-2"><Field label="Sealed policy ID" value={policy} onChange={setPolicy}/><label className="block"><span className="mb-2 block text-xs text-zinc-500">Workflow deadline</span><input required type="datetime-local" value={deadline} onChange={(e)=>setDeadline(e.target.value)} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20"/></label></div><button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50">{busy?<LoaderCircle size={15} className="animate-spin"/>:<GitFork size={15}/>} {account?"Create workflow":"Connect wallet"}</button></form>}</AppShell>
}
function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><input required value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20"/></label>}
