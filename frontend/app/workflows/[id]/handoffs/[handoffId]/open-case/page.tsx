"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, Scale } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  readAdjudicator,
  writeRegistry,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";

export default function OpenCasePage(){const p=useParams<{id:string;handoffId:string}>();const router=useRouter();const{account,connect}=useWallet();const[claim,setClaim]=useState("");const[busy,setBusy]=useState(false);async function submit(e:FormEvent){e.preventDefault();if(!account){await connect();return}setBusy(true);try{await writeRegistry(account,"open_case",[BigInt(p.id),BigInt(p.handoffId),claim]);const id=await readAdjudicator<bigint>("get_latest_case_for_opener",[account],"accepted");toast.success(`Case #${id.toString()} accepted`);router.push(`/cases/${id.toString()}?state=accepted`)}catch(error){toast.error(error instanceof Error?error.message:"Case opening failed")}finally{setBusy(false)}}return <AppShell><Link href={`/workflows/${p.id}`} className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft size={14}/> Workflow #{p.id}</Link><div className="mt-6 max-w-3xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Handoff #{p.handoffId}</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Open a dispute.</h1><p className="mt-3 text-sm leading-6 text-zinc-500">The claim frames the dispute, but it cannot override the sealed handoff criteria or evidence policy.</p></div><form onSubmit={submit} className="mt-8 max-w-3xl rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><label><span className="mb-2 block text-xs text-zinc-500">Claim</span><textarea required rows={6} value={claim} onChange={e=>setClaim(e.target.value)} placeholder="Describe the alleged material breach and the affected responsibility boundary." className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-3 text-sm leading-6 outline-none focus:border-white/20"/></label><button disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50">{busy?<LoaderCircle className="animate-spin" size={15}/>:<Scale size={15}/>} {account?"Open case":"Connect wallet"}</button></form></AppShell>}
