import { Check, Circle, ShieldCheck } from "lucide-react";

export function ConsensusTimeline({ reviewed, settlementQueued }: { reviewed: boolean; settlementQueued: boolean }) {
  const items = [
    { label: "Evidence assembled", done: true },
    { label: "GenLayer review", done: reviewed },
    { label: "Post-review response window", done: settlementQueued },
    { label: "Finality-only settlement queued", done: settlementQueued },
  ];
  return (
    <div className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5">
      <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-sky-300"/><h3 className="font-medium">Consequence path</h3></div>
      <div className="mt-5 space-y-4">
        {items.map((item, index) => <div key={item.label} className="flex gap-3"><div className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${item.done ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-300" : "border-white/10 text-zinc-700"}`}>{item.done ? <Check size={13}/> : <Circle size={10}/>}</div><div><div className={`text-sm ${item.done ? "text-zinc-200" : "text-zinc-600"}`}>{item.label}</div>{index === 2 ? <div className="mt-1 text-[11px] text-zinc-700">A fresh revision can supersede the old verdict before settlement is queued.</div> : null}</div></div>)}
      </div>
    </div>
  );
}
