import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 dark:bg-black">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          PNC Selection System
        </h1>
        <form
          action={async () => {
            "use server";
            await signIn("keycloak");
          }}
        >
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Sign in with Keycloak
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">PNC Selection System</h1>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </div>

      <section className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Signed in as</p>
        <p className="text-lg font-medium">{session.user?.name ?? session.user?.email}</p>
        <p className="mt-4 text-sm text-zinc-500">Groups</p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {session.roles.length === 0 && (
            <li className="text-sm text-amber-600">No group assigned</li>
          )}
          {session.roles.map((role) => (
            <li
              key={role}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {role}
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex gap-4 text-sm font-medium">
        {session.roles.includes("system-admin") && (
          <Link className="text-blue-600 hover:underline" href="/admin">
            Admin area
          </Link>
        )}
        {(session.roles.includes("committee-user") || session.roles.includes("system-admin")) && (
          <Link className="text-blue-600 hover:underline" href="/committee">
            Committee area
          </Link>
        )}
      </nav>
    </main>
  );
}
