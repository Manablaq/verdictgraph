"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GitBranch, LayoutDashboard, Network, Plus, Scale, Settings2, Vault } from "lucide-react";
import { WalletButton } from "./wallet-button";
import { getCoreAddress } from "@/lib/genlayer/client";

const nav = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/workflows", label: "Workflows", icon: Network },
  { href: "/create", label: "Create", icon: Plus },
  { href: "/vault", label: "Vault", icon: Vault },
  { href: "/setup", label: "Setup", icon: Settings2 },
  { href: "/docs", label: "Protocol", icon: BookOpen },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const configured = Boolean(getCoreAddress());
  return (
    <div className="min-h-screen bg-[#07090d] text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-white/[.07] bg-[#07090d]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1540px] items-center gap-4 px-5 lg:px-7">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[.05]"><GitBranch size={16} /></span>
            VerdictGraph
          </Link>
          <div className="hidden h-6 w-px bg-white/10 md:block" />
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/app" && pathname.startsWith(href + "/"));
              return (
                <Link key={href} href={href} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${active ? "bg-white/[.08] text-white" : "text-zinc-500 hover:bg-white/[.04] hover:text-zinc-200"}`}>
                  <Icon size={15} />{label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] sm:flex ${configured ? "border-emerald-400/15 bg-emerald-400/[.07] text-emerald-300" : "border-amber-400/15 bg-amber-400/[.07] text-amber-300"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${configured ? "bg-emerald-300" : "bg-amber-300"}`} />
              {configured ? "Bradbury configured" : "Deployment not configured"}
            </div>
            <WalletButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1540px] px-5 py-8 lg:px-7">{children}</main>
      <footer className="mx-auto flex max-w-[1540px] items-center justify-between border-t border-white/[.06] px-5 py-8 text-xs text-zinc-600 lg:px-7">
        <span className="inline-flex items-center gap-2"><Scale size={13}/> Evidence-bound adjudication on GenLayer</span>
        <span>Bradbury · Chain ID 4221</span>
      </footer>
    </div>
  );
}
