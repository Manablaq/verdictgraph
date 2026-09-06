import { ArrowRight, CheckCircle2, Circle, GitBranch, ShieldAlert } from "lucide-react";
import { shortAddress } from "@/lib/format";

export type GraphHandoff = {
  id: number;
  requester: string;
  provider: string;
  responsibility: string;
  dependencies?: number[];
  caseId?: number;
};

export function WorkflowGraph({ handoffs }: { handoffs: GraphHandoff[] }) {
  if (!handoffs.length) return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">No handoffs registered yet.</div>;
  return (
    <div className="space-y-3">
      {handoffs.map((handoff, index) => (
        <div key={handoff.id} className="group relative rounded-2xl border border-white/[.08] bg-black/20 p-4 transition hover:border-white/[.14]">
          <div className="flex items-start gap-4">
            <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border ${handoff.caseId ? "border-amber-300/20 bg-amber-300/10 text-amber-200" : "border-emerald-300/15 bg-emerald-300/[.06] text-emerald-300"}`}>
              {handoff.caseId ? <ShieldAlert size={16}/> : index === 0 ? <Circle size={14}/> : <CheckCircle2 size={15}/>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>Handoff #{handoff.id}</span><span>·</span><span>{shortAddress(handoff.requester)}</span><ArrowRight size={12}/><span>{shortAddress(handoff.provider)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-200">{handoff.responsibility}</p>
              {handoff.dependencies?.length ? <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-sky-200/70"><GitBranch size={13}/><span>Depends on</span>{handoff.dependencies.map((dependency) => <span key={dependency} className="rounded-full border border-sky-300/10 bg-sky-300/[.04] px-2 py-1">#{dependency}</span>)}</div> : <div className="mt-3 text-[11px] text-zinc-700">No upstream dependency</div>}
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider ${handoff.caseId ? "border-amber-300/15 text-amber-300" : "border-white/10 text-zinc-600"}`}>{handoff.caseId ? `Case #${handoff.caseId}` : "Clear"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
