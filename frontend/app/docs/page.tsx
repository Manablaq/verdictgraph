import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { GitBranch, Scale, ShieldCheck, TimerReset } from "lucide-react";

const sections = [
  { icon: GitBranch, title: "1. Bind the handoff", text: "A workflow owner registers an acyclic handoff with requester, provider, responsibility, exact breach criteria, principal, provider bond, and deterministic consequence rules." },
  { icon: ShieldCheck, title: "2. Seal evidence authority", text: "Each workflow points to a sealed policy fingerprint containing approved issuer wallet identities, approved HTTPS publisher boundaries, freshness/expiry rules, corroboration thresholds, and recovery timing." },
  { icon: Scale, title: "3. Review independently", text: "The GenLayer leader and validators fetch the same hash-pinned evidence independently, reapply the registered criteria, and must exactly agree on every field that can change downstream consequences." },
  { icon: TimerReset, title: "4. Settle only after finality", text: "A reviewed verdict enters a bounded response window. A fresh revision supersedes it. Only the latest still-current verdict can queue a finality-only external message to the deterministic EVM Vault." },
];

export default function ProtocolPage() {
  return <AppShell>
    <section className="max-w-4xl"><div className="text-xs uppercase tracking-[.2em] text-zinc-600">Protocol</div><h1 className="mt-2 text-4xl font-semibold tracking-[-.04em]">How VerdictGraph works.</h1><p className="mt-4 max-w-3xl text-base leading-7 text-zinc-500">VerdictGraph is deliberately narrow: it adjudicates a specific registered handoff. It does not claim that a URL is authoritative merely because its bytes match a hash, and it does not let an LLM choose payout amounts.</p></section>
    <div className="mt-9 grid max-w-6xl gap-4 md:grid-cols-2">{sections.map(({icon:Icon,title,text})=><article key={title} className="rounded-[26px] border border-white/[.08] bg-white/[.02] p-6"><Icon size={19} className="text-sky-300"/><h2 className="mt-5 text-lg font-medium">{title}</h2><p className="mt-3 text-sm leading-6 text-zinc-500">{text}</p></article>)}</div>
    <div className="mt-5 grid max-w-6xl gap-4 lg:grid-cols-3"><Card title="Hash ≠ provenance">SHA-256 proves the fetched bytes match the registered bytes. Authority comes from the sealed issuer identity and publisher policy.</Card><Card title="Accepted ≠ finalized">Accepted results remain appealable. The explorer separates provisional accepted workspaces from finalized protocol state.</Card><Card title="Consensus ≠ execution success">The frontend checks transaction execution outcome as well as consensus status before treating a write as successful.</Card></div>
    <section className="mt-5 max-w-6xl rounded-[26px] border border-amber-300/10 bg-amber-300/[.025] p-6"><div className="text-xs uppercase tracking-[.16em] text-amber-200/60">Explicit trust assumption</div><p className="mt-3 text-sm leading-6 text-zinc-500">VerdictGraph can enforce that corroboration comes from different approved wallet identities, different publisher boundaries, different stable record IDs and different content digests. It cannot cryptographically prove that two approved organizations are economically or operationally independent. Integrators must choose authorities whose independence they are prepared to trust.</p></section>
  </AppShell>;
}

function Card({title,children}:{title:string;children:ReactNode}) { return <div className="rounded-[24px] border border-white/[.08] bg-white/[.02] p-5"><h3 className="font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-500">{children}</p></div>; }
