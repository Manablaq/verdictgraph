import Link from "next/link";
import { ArrowRight, FileKey2, GitFork, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";

export default function CreatePage() {
  return (
    <AppShell>
      <div className="max-w-5xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Create</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Build the trust boundary before the dispute.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">VerdictGraph deliberately separates authority configuration from workflow commitments. Seal a policy first, then bind workflows and handoffs to its exact fingerprint.</p></div>
      <div className="mt-9 grid gap-4 lg:grid-cols-2">
        <Link href="/create/policy" className="group rounded-[30px] border border-white/[.08] bg-white/[.025] p-7 transition hover:border-white/[.16]"><div className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[.05] text-emerald-300"><FileKey2 size={20}/></div><h2 className="mt-10 text-xl font-medium">1. Seal an evidence policy</h2><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Register approved issuer addresses and HTTPS publisher boundaries, then freeze freshness, validity, corroboration, response, repair and recovery rules into one fingerprint.</p><div className="mt-8 flex items-center gap-2 text-sm text-zinc-300">Configure policy <ArrowRight size={15} className="transition group-hover:translate-x-1"/></div></Link>
        <Link href="/create/workflow" className="group rounded-[30px] border border-white/[.08] bg-white/[.025] p-7 transition hover:border-white/[.16]"><div className="grid h-12 w-12 place-items-center rounded-2xl border border-sky-300/15 bg-sky-300/[.05] text-sky-300"><GitFork size={20}/></div><h2 className="mt-10 text-xl font-medium">2. Create a workflow graph</h2><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Bind a workflow to one sealed policy, then add explicit requester→provider handoffs with criteria, bonds, deadlines and deterministic consequence rules.</p><div className="mt-8 flex items-center gap-2 text-sm text-zinc-300">Create workflow <ArrowRight size={15} className="transition group-hover:translate-x-1"/></div></Link>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/[.07] bg-white/[.015] p-5 text-sm text-zinc-500"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-zinc-600"/><p>These are separate chain transactions by design. Each accepted transaction is provisional until finalization; the finalized explorer never labels accepted state as permanent.</p></div>
    </AppShell>
  );
}
