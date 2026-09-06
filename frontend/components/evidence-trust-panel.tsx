import { BadgeCheck, Clock3, Fingerprint, Link2, ShieldCheck } from "lucide-react";
import { asNumber } from "@/lib/format";
import type { RevisionRecord } from "@/lib/types";

export function EvidenceTrustPanel({ revision }: { revision: RevisionRecord }) {
  const rows = [
    { label: "Distinct issuers", value: String(asNumber(revision.distinct_issuer_count)), icon: Fingerprint },
    { label: "Distinct publishers", value: String(asNumber(revision.distinct_publisher_count)), icon: Link2 },
    { label: "Evidence records", value: String(asNumber(revision.evidence_count)), icon: ShieldCheck },
    { label: "Corroboration group", value: revision.corroboration_group || "Not set", icon: BadgeCheck },
  ];
  return (
    <div className="rounded-[24px] border border-white/[.08] bg-white/[.025] p-5">
      <div className="flex items-center justify-between"><div><div className="text-xs uppercase tracking-[.17em] text-zinc-600">Evidence trust</div><h3 className="mt-1 font-medium">Revision #{asNumber(revision.revision_no)}</h3></div><Clock3 size={17} className="text-zinc-600"/></div>
      <div className="mt-5 divide-y divide-white/[.06]">
        {rows.map(({ label, value, icon: Icon }) => <div key={label} className="flex items-center justify-between py-3 text-sm"><span className="flex items-center gap-2 text-zinc-500"><Icon size={14}/>{label}</span><span className="max-w-[55%] truncate text-right text-zinc-200">{value}</span></div>)}
      </div>
      {revision.failure_code ? <div className="mt-4 rounded-xl border border-rose-400/15 bg-rose-400/[.05] p-3 text-xs text-rose-200">Repair required: {revision.failure_code}</div> : null}
    </div>
  );
}
