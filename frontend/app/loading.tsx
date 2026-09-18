export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6" aria-busy="true" aria-live="polite">
      <div className="rounded-2xl border border-white/[.08] bg-white/[.02] px-5 py-4 text-sm text-zinc-500">Loading finalized state…</div>
    </main>
  );
}
