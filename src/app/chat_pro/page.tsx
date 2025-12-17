import Link from "next/link";

export default function ChatProPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-16">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--brand)_18%,transparent)] px-3 py-1 text-xs text-[var(--primary)]">
          Coming soon
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text)]">
          BotCat — Pro (v2.0)
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
          This version requires registration/authorization and uses the latest OpenAI
          models. We are preparing the full experience.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--action)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Back to Home
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--action)_6%,transparent)]"
          >
            Open BotCat v1.0
          </Link>
        </div>

        <div className="mt-6 text-xs text-[var(--text-muted)]">
          Your theme is selected automatically by your browser (light/dark).
        </div>
      </div>
    </main>
  );
}
