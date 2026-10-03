import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut, keycloakLogoutUrl } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import { canAccessAdminArea } from "@/lib/permissions";

export default async function Home() {
  const session = await auth();

  if (!session) {
    // Unauthenticated requests never actually reach this branch - middleware
    // (proxy.ts) redirects to /login before this page renders. This is only
    // a defensive fallback in case this route is ever reached without going
    // through middleware.
    redirect("/login?callbackUrl=/");
  }

  // Keycloak can't pick a post-login landing page per role (the client has a
  // single redirect target), so admin-area users are routed to their dashboard here.
  if (canAccessAdminArea(session.roles)) {
    redirect("/admin");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">PNC Selection System</h1>
        <form
          action={async () => {
            "use server";
            // Clearing our own cookie isn't enough on its own - see
            // keycloakLogoutUrl's comment in auth.ts for why the browser
            // also has to be sent to Keycloak's end_session_endpoint.
            const idToken = session.idToken;
            await signOut({ redirect: false });
            redirect(keycloakLogoutUrl(idToken));
          }}
        >
          <button type="submit" className={buttonClasses("secondary")}>
            Sign out
          </button>
        </form>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <p className="text-sm text-ink-muted">Signed in as</p>
        <p className="text-lg font-semibold text-ink">{session.user?.name ?? session.user?.email}</p>
        <p className="mt-4 text-sm text-ink-muted">Groups</p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {session.roles.length === 0 && (
            <li className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-ink">No group assigned</li>
          )}
          {session.roles.map((role) => (
            <li key={role} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              {role}
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex flex-wrap gap-3">
        {session.roles.includes("system-admin") && (
          <Link className={buttonClasses("primary")} href="/admin">
            Admin area
          </Link>
        )}
        {(session.roles.includes("committee-user") || session.roles.includes("system-admin")) && (
          <Link className={buttonClasses("secondary")} href="/committee">
            Committee area
          </Link>
        )}
      </nav>
    </main>
  );
}
