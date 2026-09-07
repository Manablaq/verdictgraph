"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, LoaderCircle, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { FileHashHelper } from "@/components/file-hash-helper";
import {
  writeRegistry,
} from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet-context";

export default function SubmitDeliveryPage() {
  const params = useParams<{ id: string; handoffId: string }>();
  const router = useRouter();
  const { account, connect } = useWallet();
  const [uri, setUri] = useState("");
  const [sha, setSha] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account) {
      await connect();
      return;
    }
    setBusy(true);
    try {
      await writeRegistry(account, "submit_handoff_delivery", [BigInt(params.handoffId), uri, sha.trim().toLowerCase()]);
      toast.success("Delivery submitted to VerdictGraph");
      router.push(`/workflows/${params.id}?state=accepted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delivery submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <Link href={`/workflows/${params.id}`} className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200">
        <ArrowLeft size={14} /> Workflow #{params.id}
      </Link>
      <section className="mt-6 max-w-3xl">
        <div className="text-xs uppercase tracking-[.2em] text-zinc-600">Handoff #{params.handoffId}</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">Submit the immutable delivery.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
          Your wallet authenticates who submitted the handoff. The SHA-256 binds the exact delivered bytes. The URI is only the retrieval path and does not create authority by itself.
        </p>
      </section>

      <form onSubmit={submit} className="mt-8 max-w-3xl space-y-5 rounded-[28px] border border-white/[.08] bg-white/[.02] p-6">
        <label className="block">
          <span className="mb-2 block text-xs text-zinc-500">Immutable/versioned HTTPS delivery URI</span>
          <input required type="url" value={uri} onChange={(event) => setUri(event.target.value)} placeholder="https://…" className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-white/20" />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs text-zinc-500">Expected SHA-256</span>
          <input required pattern="[0-9a-fA-F]{64}" value={sha} onChange={(event) => setSha(event.target.value)} placeholder="64 hexadecimal characters" className="w-full rounded-xl border border-white/[.09] bg-black/20 px-3 py-2.5 font-mono text-sm outline-none focus:border-white/20" />
        </label>
        <FileHashHelper onHash={setSha} />
        <div className="rounded-xl border border-amber-300/10 bg-amber-300/[.025] px-4 py-3 text-xs leading-5 text-amber-100/70">
          V1 intentionally stores one immutable delivery for each handoff. After submission, correction happens through the dispute/response evidence flow rather than silently replacing the original artifact.
        </div>
        <button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50">
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <PackageCheck size={15} />}
          {account ? "Submit delivery" : "Connect wallet"}
        </button>
      </form>
    </AppShell>
  );
}
