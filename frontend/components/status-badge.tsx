import type { ReactNode } from "react";

const tones: Record<string, string> = {
  ACTIVE: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  REVIEWED: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  OPEN: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  REPAIR_REQUIRED: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  RECOVERED: "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
  DRAFT: "border-violet-400/20 bg-violet-400/10 text-violet-200",
  CLOSED: "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
  BREACH: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  NO_BREACH: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  UNDETERMINED: "border-amber-400/20 bg-amber-400/10 text-amber-200",
};

export function StatusBadge({ value, icon }: { value: string; icon?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${tones[value] ?? "border-white/10 bg-white/5 text-zinc-300"}`}>
      {icon}{value.replaceAll("_", " ")}
    </span>
  );
}
