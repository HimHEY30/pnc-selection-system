export default function CommitteePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Committee area</h1>
      <p className="text-zinc-500">
        Reachable by committee-user and system-admin — enforced in middleware.ts.
      </p>
    </main>
  );
}
