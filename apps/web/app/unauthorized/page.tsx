import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-semibold">Not authorized</h1>
      <p className="text-zinc-500">
        Your account&apos;s group doesn&apos;t have access to that page.
      </p>
      <Link className="text-blue-600 hover:underline" href="/">
        Back home
      </Link>
    </main>
  );
}
