import {
  Braces,
  ShieldAlert,
} from "lucide-react";

export function ConfigurationRequired() {
  return (
    <div className="rounded-[28px] border border-amber-300/15 bg-amber-300/[.035] p-7">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-300/15 bg-amber-300/[.06] text-amber-200">
          <ShieldAlert size={20} />
        </div>

        <div>
          <h2 className="text-lg font-semibold">
            Audited deployment configuration mismatch
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Registry, Adjudicator, and Vault must match
            the exact audited Bradbury topology. This
            interface refuses to redirect protocol
            operations to a different address.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "NEXT_PUBLIC_VERDICTGRAPH_REGISTRY_ADDRESS",
              "NEXT_PUBLIC_VERDICTGRAPH_ADJUDICATOR_ADDRESS",
              "NEXT_PUBLIC_VERDICTGRAPH_VAULT_ADDRESS",
            ].map((name) => (
              <div
                key={name}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] text-zinc-400"
              >
                <Braces size={13} />
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
