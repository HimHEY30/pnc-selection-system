export default function CommitteePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-bold text-ink">Committee area</h1>
      <p className="text-ink-muted">
        Reachable by committee-user and system-admin — enforced in middleware.ts.
      </p>
    </main>
  );
}
