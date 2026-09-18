import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
      <section className="w-full rounded-[28px] border border-white/[.08] bg-white/[.02] p-8">
        <div className="text-xs uppercase tracking-[.2em] text-zinc-600">Not found</div>
        <h1 className="mt-3 text-2xl font-semibold">That record does not exist.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">Milestone reads are bounded to finalized Registry state. Check the reference and try again.</p>
        <Link href="/milestones" className="mt-6 inline-flex rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black">Back to milestones</Link>
      </section>
    </main>
  );
}
