"use client";

import { Suspense, FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LoaderCircle, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { FileHashHelper } from "@/components/file-hash-helper";
import { ConfigurationRequired } from "@/components/configuration-required";
import { SnapshotNotice } from "@/components/snapshot-notice";
import {
  isProtocolConfigured,
  readAdjudicator,
  writeAdjudicator,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";
import type { CaseRecord, RevisionRecord } from "@/lib/types";

export default function CaseResponsePage() {
  return (
    <Suspense fallback={<AppShell><div className="text-sm text-zinc-600">Loading response form…</div></AppShell>}>
      <CaseResponseContent />
    </Suspense>
  );
}

function CaseResponseContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const stateStatus: "accepted" | "finalized" = search.get("state") === "accepted" ? "accepted" : "finalized";
  const caseId = Number(params.id);
  const { account, connect } = useWallet();
  const [busy, setBusy] = useState(false);
  const [uri, setUri] = useState("https://");
  const [sha, setSha] = useState("");
  const [mode, setMode] = useState<"loading" | "initial" | "revision" | "blocked">("loading");
  const [detail, setDetail] = useState("");
  const configured = Boolean(isProtocolConfigured());

  async function inspect() {
    if (!configured) return;
    try {
      const c = await readAdjudicator<CaseRecord>("get_case", [BigInt(caseId)], stateStatus);
      const revision = await readAdjudicator<RevisionRecord>("get_revision", [BigInt(caseId), c.current_revision], stateStatus);
      if (c.status === "OPEN") {
        if (revision.response_author && !/^0x0{40}$/i.test(revision.response_author)) {
          setMode("blocked");
          setDetail("This revision already contains an authenticated response. Mark it ready or wait for review before opening a fresh revision.");
        } else {
          setMode("initial");
          setDetail("Attach one immutable, hash-pinned response to the current revision.");
        }
      } else if (c.status === "REVIEWED" || c.status === "REPAIR_REQUIRED") {
        setMode("revision");
        setDetail("This creates a new immutable revision and supersedes the previous verdict for future settlement.");
      } else {
        setMode("blocked");
        setDetail("This case is terminal and cannot accept another response.");
      }
    } catch (error) {
      setMode("blocked");
      setDetail(error instanceof Error ? error.message : "Unable to inspect case state");
    }
  }

  useEffect(() => { void inspect(); }, [caseId, configured, stateStatus]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account) { await connect(); return; }
    if (mode !== "initial" && mode !== "revision") return;
    setBusy(true);
    try {
      const functionName = mode === "initial" ? "submit_response" : "begin_revision";
      await writeAdjudicator(account, functionName, [BigInt(caseId), uri, sha.toLowerCase()]);
      toast.success(mode === "initial" ? "Response accepted" : "Fresh revision accepted");
      router.push(`/cases/${caseId}?state=accepted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Response transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return <AppShell>
    <Link href={`/cases/${caseId}${stateStatus === "accepted" ? "?state=accepted" : ""}`} className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft size={14}/> Case #{caseId}</Link>
    <div className="mt-4"><SnapshotNotice state={stateStatus}/></div>
    <div className="mt-6 max-w-3xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Counter-evidence</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Response / fresh revision.</h1><p className="mt-3 text-sm leading-6 text-zinc-500">{detail || "Inspecting current case state…"}</p></div>
    {!configured ? <div className="mt-7"><ConfigurationRequired/></div> : mode === "loading" ? <div className="mt-7 text-sm text-zinc-600">Reading case…</div> : mode === "blocked" ? <div className="mt-7 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-5 text-sm text-amber-100/80">{detail}</div> : <form onSubmit={submit} className="mt-8 max-w-3xl rounded-[28px] border border-white/[.08] bg-white/[.02] p-6">
      <div className="flex items-center gap-2 text-sm font-medium">{mode === "revision" ? <RotateCcw size={16}/> : <Send size={16}/>} {mode === "revision" ? "Start revision with response" : "Attach response to current revision"}</div>
      <div className="mt-5 space-y-4">
        <Field label="Immutable HTTPS response URI" value={uri} onChange={setUri} placeholder="https://…"/>
        <Field label="Expected SHA-256" value={sha} onChange={setSha} placeholder="64 lowercase hexadecimal characters" mono/>
      <FileHashHelper onHash={setSha} />

      </div>
      <button disabled={busy} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50">{busy ? <LoaderCircle size={15} className="animate-spin"/> : mode === "revision" ? <RotateCcw size={15}/> : <Send size={15}/>} {account ? (mode === "revision" ? "Create fresh revision" : "Submit response") : "Connect wallet"}</button>
    </form>}
  </AppShell>;
}

function Field({ label, value, onChange, placeholder, mono = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; mono?: boolean }) {
  return <label className="block"><span className="mb-2 block text-xs text-zinc-500">{label}</span><input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20 ${mono ? "font-mono" : ""}`}/></label>;
}
