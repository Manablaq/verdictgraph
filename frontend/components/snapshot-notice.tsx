import { AlertTriangle, ShieldCheck } from "lucide-react";

export function SnapshotNotice({ state }: { state: "accepted" | "finalized" }) {
  if (state === "finalized") return <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[.05] px-3 py-1.5 text-[11px] text-emerald-300"><ShieldCheck size={13}/> Finalized state</div>;
  return <div className="flex items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4 text-xs leading-5 text-amber-100/80"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300"/><span><strong className="font-medium text-amber-200">Accepted snapshot — provisional.</strong> This state can be recomputed after a successful appeal. It is shown only so dependent setup/review actions can continue; finalized explorer totals exclude it.</span></div>;
}
