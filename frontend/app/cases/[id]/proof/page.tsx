"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileOutput } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfigurationRequired } from "@/components/configuration-required";
import { ProofPack } from "@/components/proof-pack";
import { loadCase, type ProtocolState } from "@/lib/case-data";
import { isProtocolConfigured } from "@/lib/genlayer/client";

export default function CaseProofPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-sm text-zinc-600">Loading Proof Pack…</div></AppShell>}>
      <CaseProofContent />
    </Suspense>
  );
}

function CaseProofContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const stateStatus: ProtocolState = search.get("state") === "accepted" ? "accepted" : "finalized";
  const caseId = Number(params.id);
  const configured = Boolean(isProtocolConfigured());
  const query = useQuery({
    queryKey: ["case-proof-pack", caseId, stateStatus],
    queryFn: () => loadCase(caseId, stateStatus),
    enabled: configured && Number.isInteger(caseId) && caseId > 0,
  });

  return (
    <AppShell>
      <Link href={`/cases/${caseId}${stateStatus === "accepted" ? "?state=accepted" : ""}`} className="no-print inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200"><ArrowLeft size={14} /> Case #{caseId}</Link>
      <div className="mt-5 flex items-center gap-2 text-xs uppercase tracking-[.2em] text-zinc-600"><FileOutput size={14} /> Publication surface</div>
      {!configured ? <div className="mt-6"><ConfigurationRequired /></div> : query.isLoading ? <div className="mt-8 text-sm text-zinc-600">Reading {stateStatus} case state…</div> : query.isError || !query.data ? <div className="mt-8 rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-5 text-sm text-rose-200">Proof Pack could not load case #{caseId}. Refresh and try again.</div> : <div className="mt-6"><ProofPack caseId={caseId} data={query.data} stateStatus={stateStatus} /></div>}
    </AppShell>
  );
}
