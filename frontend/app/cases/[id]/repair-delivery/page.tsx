"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, FormEvent, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { FileHashHelper } from "@/components/file-hash-helper";
import { SnapshotNotice } from "@/components/snapshot-notice";
import {
  isProtocolConfigured,
  readRegistry,
  readAdjudicator,
  writeRegistry,
  writeAdjudicator,
  waitForFinalized,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";
import { asNumber, shortAddress } from "@/lib/format";
import type { CaseRecord, HandoffRecord, RevisionRecord } from "@/lib/types";

export default function RepairDeliveryPage() {
  return (
    <Suspense fallback={<AppShell><div className="text-sm text-zinc-600">Loading delivery repair…</div></AppShell>}>
      <RepairDeliveryContent />
    </Suspense>
  );
}

function RepairDeliveryContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const caseId = Number(params.id);
  const stateStatus: "accepted" | "finalized" = search.get("state") === "accepted" ? "accepted" : "finalized";
  const { account, connect } = useWallet();
  const configured = Boolean(isProtocolConfigured());
  const [handoff, setHandoff] = useState<HandoffRecord | null>(null);
  const [failureCode, setFailureCode] = useState("");
  const [uri, setUri] = useState("https://");
  const [sha, setSha] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || !Number.isInteger(caseId) || caseId <= 0) return;
    void (async () => {
      try {
        const c = await readAdjudicator<CaseRecord>("get_case", [BigInt(caseId)], stateStatus);
        const [h, r] = await Promise.all([
          readRegistry<HandoffRecord>("get_handoff", [c.handoff_id], stateStatus),
          readAdjudicator<RevisionRecord>("get_revision", [BigInt(caseId), c.current_revision], stateStatus),
        ]);
        if (c.status !== "REPAIR_REQUIRED" || !r.failure_code.startsWith("DELIVERY_")) {
          throw new Error("Current case state does not contain a repairable delivery finding");
        }
        setHandoff(h);
        setFailureCode(r.failure_code);
        setUri(h.delivery_uri || "https://");
        setSha(h.delivery_sha256 || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load delivery repair state");
      }
    })();
  }, [caseId, configured, stateStatus]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account) { await connect(); return; }
    setBusy(true);
    try {
      const repaired = await writeRegistry(account, "repair_handoff_delivery", [BigInt(caseId), uri, sha.trim().toLowerCase()]);
      toast.message("Delivery repair accepted; waiting for finality before opening the new review revision…");
      const final = await waitForFinalized(repaired.hash);
      if (!final.executionSucceeded) throw new Error("Finalized delivery repair did not finish with return");
      await writeAdjudicator(account, "begin_revision", [BigInt(caseId), "", ""]);
      toast.success("Versioned delivery repair recorded and fresh review revision opened");
      router.push(`/cases/${caseId}?state=accepted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delivery repair failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <Link href={`/cases/${caseId}${stateStatus === "accepted" ? "?state=accepted" : ""}`} className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200"><ArrowLeft size={14}/> Case #{caseId}</Link>
      <div className="mt-4"><SnapshotNotice state={stateStatus}/></div>
      <section className="mt-6 max-w-3xl">
        <div className="text-xs uppercase tracking-[.2em] text-zinc-600">Versioned delivery repair</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Repair the delivery without erasing history.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">The prior delivery version remains on-chain. This action creates the next immutable version, waits for it to finalize, then opens a fresh case revision so validators review the repaired artifact rather than silently mutating the failed result.</p>
      </section>
      {error ? <div className="mt-7 max-w-3xl rounded-2xl border border-rose-400/15 bg-rose-400/[.04] p-5 text-sm text-rose-200">{error}</div> : !handoff ? <div className="mt-7 text-sm text-zinc-600">Reading repair state…</div> : <form onSubmit={submit} className="mt-8 max-w-3xl space-y-5 rounded-[28px] border border-white/[.08] bg-white/[.02] p-6">
        <div className="grid gap-3 rounded-xl border border-white/[.07] bg-black/20 p-4 text-xs sm:grid-cols-3"><div><div className="text-zinc-600">Failure</div><div className="mt-1 text-amber-200">{failureCode}</div></div><div><div className="text-zinc-600">Current version</div><div className="mt-1">v{asNumber(handoff.delivery_version)}</div></div><div><div className="text-zinc-600">Provider</div><div className="mt-1">{shortAddress(handoff.provider)}</div></div></div>
        <label className="block"><span className="mb-2 block text-xs text-zinc-500">Repaired immutable/versioned HTTPS URI</span><input required type="url" value={uri} onChange={(e)=>setUri(e.target.value)} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20"/></label>
        <label className="block"><span className="mb-2 block text-xs text-zinc-500">SHA-256 for the new delivery version</span><input required pattern="[0-9a-fA-F]{64}" value={sha} onChange={(e)=>setSha(e.target.value)} className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 font-mono text-sm outline-none focus:border-white/20"/></label>
        <FileHashHelper onHash={setSha}/>
        <button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50">{busy?<LoaderCircle size={15} className="animate-spin"/>:<RotateCcw size={15}/>} {account?"Finalize repair and open revision":"Connect wallet"}</button>
      </form>}
    </AppShell>
  );
}
