import { signIn } from "@/auth";
import { AutoSubmit } from "./AutoSubmit";

const FORM_ID = "pnc-signin-redirect";

// Middleware sends every unauthenticated request here instead of straight to
// Auth.js's generic (multi-provider) sign-in page, since this app only has
// one provider (Keycloak) and the brief wants Keycloak's own themed login
// form to appear immediately, not an intermediate "Sign in with Keycloak"
// button screen. The actual redirect still goes through next-auth's own
// signIn() server action - no custom OAuth handling - it's just submitted
// automatically instead of waiting for a click.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-black">
      <p className="text-sm text-zinc-500">Redirecting to sign in…</p>
      <form
        id={FORM_ID}
        action={async () => {
          "use server";
          await signIn("keycloak", { redirectTo: callbackUrl || "/" });
        }}
      >
        <noscript>
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Continue to sign in
          </button>
        </noscript>
      </form>
      <AutoSubmit formId={FORM_ID} />
    </main>
  );
}
