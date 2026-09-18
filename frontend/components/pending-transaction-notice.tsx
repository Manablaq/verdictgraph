import { RefreshCw } from "lucide-react";
import { explorerTx } from "@/lib/genlayer/client";

export function PendingTransactionNotice({
  label,
  hash,
  busy = false,
  onRecheck,
}: {
  label: string;
  hash: string;
  busy?: boolean;
  onRecheck?: () => void;
}) {
  return (
    <div
      className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4 text-xs leading-5 text-amber-100/80"
      role="status"
      aria-live="polite"
    >
      <p>
        {label} was accepted by GenLayer and is awaiting Bradbury finality. This page will recheck automatically; do not submit the same action again.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onRecheck ? (
          <button
            type="button"
            onClick={onRecheck}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 px-3 py-2 text-xs text-amber-100 disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : undefined} />
            Recheck finality
          </button>
        ) : null}
        <a
          href={explorerTx(hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-amber-200/20 px-3 py-2 text-xs text-amber-100"
        >
          Open explorer
        </a>
      </div>
    </div>
  );
}
