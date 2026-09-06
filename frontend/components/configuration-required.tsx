import { Braces, ShieldAlert } from "lucide-react";

export function ConfigurationRequired() {
  return (
    <div className="rounded-[28px] border border-amber-300/15 bg-amber-300/[.035] p-7">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-300/15 bg-amber-300/[.06] text-amber-200"><ShieldAlert size={20}/></div>
        <div>
          <h2 className="text-lg font-semibold">Live contract not configured yet</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">This surface intentionally refuses to invent chain state. After Bradbury deployment, set the exact deployed Core and Vault addresses in the frontend environment and the app will read finalized contract state.</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-zinc-400"><Braces size={14}/> NEXT_PUBLIC_VERDICTGRAPH_CORE_ADDRESS</div>
        </div>
      </div>
    </div>
  );
}
