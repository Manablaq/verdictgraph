"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MilestoneConfigurationRequired } from "@/components/milestone-configuration-required";
import { MilestoneProof } from "@/components/milestone-proof";
import { isMilestoneConfigured } from "@/lib/genlayer/client";
import { verifyMilestoneTopology } from "@/lib/genlayer/milestone-vault";
import { loadMilestoneData } from "@/lib/milestone-data";

export default function MilestoneProofPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const milestoneId = Number(rawId);
  const configured = isMilestoneConfigured();
  const query = useQuery({ queryKey: ["milestone-proof", milestoneId], queryFn: async () => { await verifyMilestoneTopology(); return loadMilestoneData(milestoneId); }, enabled: configured && Number.isInteger(milestoneId) && milestoneId > 0 });
  return <AppShell><Link href={`/milestones/${milestoneId}`} className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft size={14}/> Milestone #{milestoneId}</Link>{!configured ? <div className="mt-8"><MilestoneConfigurationRequired/></div> : query.isLoading ? <div className="mt-8 text-sm text-zinc-600">Reading finalized milestone state…</div> : query.isError || !query.data ? <div className="mt-8 rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-5 text-sm text-rose-200">Milestone #{milestoneId} could not be loaded.</div> : <div className="mt-6"><MilestoneProof milestoneId={milestoneId} data={query.data}/></div>}</AppShell>;
}
