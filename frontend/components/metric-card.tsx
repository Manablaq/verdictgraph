import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: LucideIcon }) {
  return (
    <div className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5">
      <div className="flex items-center justify-between"><span className="text-xs uppercase tracking-[.16em] text-zinc-600">{label}</span><Icon size={16} className="text-zinc-600"/></div>
      <div className="mt-4 text-3xl font-semibold tracking-[-.03em]">{value}</div>
      <div className="mt-2 text-xs text-zinc-500">{detail}</div>
    </div>
  );
}
