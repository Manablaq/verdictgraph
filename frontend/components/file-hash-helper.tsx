"use client";

import { FileCheck2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { sha256File } from "@/lib/hash";

export function FileHashHelper({ onHash }: { onHash: (sha256: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setName(file.name);
    try {
      onHash(await sha256File(file));
      toast.success("SHA-256 calculated locally");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not hash file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-dashed border-white/10 bg-white/[.015] px-4 py-3 text-xs text-zinc-500 hover:border-white/20 hover:text-zinc-300">
      <span className="inline-flex items-center gap-2">
        {busy ? <LoaderCircle size={14} className="animate-spin" /> : <FileCheck2 size={14} />}
        {name ?? "Choose the exact local file to calculate its SHA-256"}
      </span>
      <span className="text-zinc-700">Local only</span>
      <input className="hidden" type="file" onChange={(event) => void pick(event.target.files?.[0])} />
    </label>
  );
}
