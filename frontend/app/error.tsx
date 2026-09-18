"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6" role="alert">
      <section className="w-full rounded-[28px] border border-rose-400/15 bg-rose-400/[.04] p-8">
        <div className="text-xs uppercase tracking-[.2em] text-rose-300/70">Runtime recovery</div>
        <h1 className="mt-3 text-2xl font-semibold text-rose-100">This page could not finish loading.</h1>
        <p className="mt-3 text-sm leading-6 text-rose-100/70">Your finalized on-chain state is unchanged. Retry the read, or return to the previous page.</p>
        {error.digest ? <p className="mt-4 break-all font-mono text-[11px] text-rose-200/50">Reference {error.digest}</p> : null}
        <button type="button" onClick={() => reset()} className="mt-6 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black">Try again</button>
      </section>
    </main>
  );
}
