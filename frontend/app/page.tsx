import Link from "next/link";
import { ArrowRight, BadgeCheck, GitBranch, ShieldCheck, TimerReset } from "lucide-react";

const nodes = [
  { name: "Research", status: "Verified", tone: "text-emerald-300" },
  { name: "Verification", status: "Breach found", tone: "text-amber-300" },
  { name: "Analysis", status: "Downstream", tone: "text-sky-300" },
  { name: "Publish", status: "Blocked", tone: "text-zinc-300" },
];

export default function Home() {
  return (
    <main className="grid-noise min-h-screen overflow-hidden">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7">
        <div className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/5"><GitBranch size={18}/></span>VerdictGraph</div>
        <div className="hidden gap-7 text-sm text-zinc-400 md:flex"><Link href="/docs">Protocol</Link><Link href="/workflows">Explorer</Link><Link href="/docs">Docs</Link></div>
        <Link href="/app" className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm">Launch app</Link>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-16 pt-20 lg:grid-cols-[1.05fr_.95fr] lg:pt-28">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300"><ShieldCheck size={14}/> GenLayer-native adjudication</div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[.96] tracking-[-.05em] md:text-7xl">Find the broken promise in an autonomous workflow.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-400">VerdictGraph binds every agent handoff to explicit responsibilities, authenticated evidence and deterministic consequences—then lets independent GenLayer validators decide whether the handoff actually complied.</p>
          <div className="mt-9 flex flex-wrap gap-3"><Link href="/create" className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black">Create workflow <ArrowRight size={15}/></Link><Link href="/workflows" className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm">Explore workflows</Link></div>
          <div className="mt-14 grid max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
            {[['Issuer','authenticated'],['Evidence','version-bound'],['Consensus','independent'],['Settlement','finalized-only']].map(([a,b]) => <div key={a} className="glass rounded-2xl p-4"><div className="text-sm font-medium">{a}</div><div className="mt-1 text-xs text-zinc-500">{b}</div></div>)}
          </div>
        </div>

        <div className="glass relative rounded-[30px] p-5 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><div className="text-xs uppercase tracking-[.22em] text-zinc-500">Illustrative case preview</div><div className="mt-1 font-medium">Grant research pipeline</div></div><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-200">Review</span></div>
          <div className="mt-7 space-y-3">
            {nodes.map((n,i)=><div key={n.name} className="relative flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4"><div className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-xs">0{i+1}</div><div className="flex-1"><div className="font-medium">{n.name}</div><div className={`mt-1 text-xs ${n.tone}`}>{n.status}</div></div>{i===1?<BadgeCheck className="text-amber-300" size={19}/>:null}</div>)}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 p-4"><div className="text-xs text-zinc-500">Evidence trust</div><div className="mt-2 flex items-center gap-2 text-sm"><ShieldCheck size={16} className="text-emerald-300"/> 2 / 2 corroborated</div></div><div className="rounded-2xl border border-white/10 p-4"><div className="text-xs text-zinc-500">Consequence</div><div className="mt-2 flex items-center gap-2 text-sm"><TimerReset size={16} className="text-sky-300"/> Finalized only</div></div></div>
          <p className="mt-4 text-[11px] leading-5 text-zinc-600">Preview data is illustrative UI content only and is not presented as live chain state.</p>
        </div>
      </section>
    </main>
  );
}
