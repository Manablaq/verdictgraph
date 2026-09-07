"use client";

import { Suspense, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, GitBranch, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import { SnapshotNotice } from "@/components/snapshot-notice";
import {
  isProtocolConfigured,
  readRegistry,
  writeRegistry,
} from "@/lib/genlayer/client";
import { asNumber } from "@/lib/format";
import { useWallet } from "@/lib/genlayer/wallet-context";
import type { HandoffRecord, WorkflowRecord } from "@/lib/types";

type Item = { id: number; ordinal: number; responsibility: string; dependencies: number[] };

export default function WorkflowDependenciesPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-sm text-zinc-600">Loading workflow dependencies…</div></AppShell>}>
      <WorkflowDependenciesContent />
    </Suspense>
  );
}

function WorkflowDependenciesContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const workflowId = Number(params.id);
  const stateStatus: "accepted" | "finalized" = search.get("state") === "finalized" ? "finalized" : "accepted";
  const { account, connect } = useWallet();
  const [items, setItems] = useState<Item[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
  const [downstream, setDownstream] = useState("");
  const [upstream, setUpstream] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const configured = Boolean(isProtocolConfigured());

  useEffect(() => {
    if (!configured || !Number.isInteger(workflowId) || workflowId <= 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const w = await readRegistry<WorkflowRecord>("get_workflow", [BigInt(workflowId)], stateStatus);
        const loaded = await Promise.all(Array.from({ length: asNumber(w.handoff_count) }, async (_, index) => {
          const id = asNumber(await readRegistry<bigint>("get_workflow_handoff", [BigInt(workflowId), BigInt(index)], stateStatus));
          const h = await readRegistry<HandoffRecord>("get_handoff", [BigInt(id)], stateStatus);
          const dependencies = await Promise.all(Array.from({ length: asNumber(h.dependency_count) }, (_, dependencyIndex) => readRegistry<bigint>("get_handoff_dependency", [BigInt(id), BigInt(dependencyIndex)], stateStatus).then(asNumber)));
          return { id, ordinal: asNumber(h.ordinal), responsibility: h.responsibility, dependencies };
        }));
        if (!cancelled) {
          setWorkflow(w);
          setItems(loaded);
          const firstDownstream = loaded.find((item) => item.ordinal > 0);
          if (firstDownstream) {
            setDownstream(String(firstDownstream.id));
            const firstUpstream = loaded.find((item) => item.ordinal < firstDownstream.ordinal);
            if (firstUpstream) setUpstream(String(firstUpstream.id));
          }
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load workflow dependencies");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [configured, workflowId, stateStatus]);

  const downstreamItem = items.find((item) => item.id === Number(downstream));
  const upstreamOptions = items.filter((item) => downstreamItem && item.ordinal < downstreamItem.ordinal && !downstreamItem.dependencies.includes(item.id));

  useEffect(() => {
    if (!downstreamItem) return;
    if (!upstreamOptions.some((item) => String(item.id) === upstream)) setUpstream(upstreamOptions[0] ? String(upstreamOptions[0].id) : "");
  }, [downstream, items]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account) { await connect(); return; }
    if (!downstream || !upstream) return;
    setBusy(true);
    try {
      await writeRegistry(account, "add_handoff_dependency", [BigInt(downstream), BigInt(upstream)]);
      toast.success(`Dependency #${upstream} → #${downstream} accepted`);
      router.refresh();
      setItems((current) => current.map((item) => item.id === Number(downstream) ? { ...item, dependencies: [...item.dependencies, Number(upstream)] } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dependency transaction failed");
    } finally {
      setBusy(false);
    }
  }

  const ownerMatches = Boolean(account && workflow && account.toLowerCase() === workflow.owner.toLowerCase());

  return <AppShell>
    <Link href={`/workflows/${workflowId}?state=${stateStatus}`} className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft size={14}/> Workflow #{workflowId}</Link>
    <div className="mt-4"><SnapshotNotice state={stateStatus}/></div>
    <div className="mt-6 max-w-4xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Workflow DAG</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Bind causal dependencies.</h1><p className="mt-3 text-sm leading-6 text-zinc-500">A downstream handoff can depend only on an earlier handoff in the same workflow. The contract enforces this ordinal rule, which makes cycles impossible by construction.</p></div>
    {!configured ? <div className="mt-7"><ConfigurationRequired/></div> : loading ? <div className="mt-7 text-sm text-zinc-600">Reading accepted workflow graph…</div> : workflow?.status !== "DRAFT" ? <div className="mt-7 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-5 text-sm text-amber-100/80">Dependencies are frozen after workflow activation.</div> : <div className="mt-8 grid max-w-5xl gap-5 lg:grid-cols-[.85fr_1.15fr]">
      <form onSubmit={submit} className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><div className="flex items-center gap-2 text-sm font-medium"><GitBranch size={16}/> Add dependency edge</div><label className="mt-5 block"><span className="mb-2 block text-xs text-zinc-500">Downstream handoff</span><select required value={downstream} onChange={(event) => setDownstream(event.target.value)} className="w-full rounded-xl border border-white/[.09] bg-[#090c11] px-3 py-2.5 text-sm"><option value="">Select…</option>{items.filter((item) => item.ordinal > 0).map((item) => <option key={item.id} value={item.id}>#{item.id} — {item.responsibility.slice(0, 55)}</option>)}</select></label><label className="mt-4 block"><span className="mb-2 block text-xs text-zinc-500">Required upstream handoff</span><select required value={upstream} onChange={(event) => setUpstream(event.target.value)} className="w-full rounded-xl border border-white/[.09] bg-[#090c11] px-3 py-2.5 text-sm"><option value="">Select…</option>{upstreamOptions.map((item) => <option key={item.id} value={item.id}>#{item.id} — {item.responsibility.slice(0, 55)}</option>)}</select></label><button disabled={busy || Boolean(account && !ownerMatches) || !downstream || !upstream} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40">{busy ? <LoaderCircle size={15} className="animate-spin"/> : <GitBranch size={15}/>} {account ? ownerMatches ? "Add dependency" : "Owner wallet required" : "Connect wallet"}</button></form>
      <section className="rounded-[28px] border border-white/[.08] bg-white/[.02] p-6"><div className="text-xs uppercase tracking-[.16em] text-zinc-600">Current edges</div><div className="mt-4 space-y-3">{items.map((item) => <div key={item.id} className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><div className="text-xs text-zinc-500">Handoff #{item.id} · ordinal {item.ordinal}</div><p className="mt-2 text-sm text-zinc-300">{item.responsibility}</p><div className="mt-3 flex flex-wrap gap-2">{item.dependencies.length ? item.dependencies.map((dependency) => <span key={dependency} className="rounded-full border border-sky-300/10 bg-sky-300/[.04] px-2 py-1 text-[11px] text-sky-200/70">depends on #{dependency}</span>) : <span className="text-[11px] text-zinc-700">root / no dependency</span>}</div></div>)}</div></section>
    </div>}
  </AppShell>;
}
