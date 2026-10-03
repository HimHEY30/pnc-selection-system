import { signIn } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4">
      <p role="status" className="text-sm text-ink-muted">Redirecting to sign in…</p>
      <form
        id={FORM_ID}
        action={async () => {
          "use server";
          await signIn("keycloak", { redirectTo: callbackUrl || "/" });
        }}
      >
        <noscript>
          <button type="submit" className={buttonClasses("primary", "lg")}>
            Continue to sign in
          </button>
        </noscript>
      </form>
      <AutoSubmit formId={FORM_ID} />
    </main>
  );
}
