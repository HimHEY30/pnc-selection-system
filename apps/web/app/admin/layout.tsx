import { redirect } from "next/navigation";
import { auth, signOut, keycloakLogoutUrl } from "@/auth";
import { loadCampaignsOrNull } from "@/lib/campaigns/api";
import { canAccessAdminArea, canManageCampaigns } from "@/lib/permissions";
import AdminShell from "./_components/AdminShell";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await auth();
  // A session whose access token could not be renewed is as good as no session.
  if (!session || session.error) {
    redirect("/login?callbackUrl=/admin");
  }
  // proxy.ts already blocks other roles; this keeps the layout safe on its own.
  if (!canAccessAdminArea(session.roles)) {
    redirect("/unauthorized");
  }

  async function signOutAction() {
    "use server";
    // Same two-step logout as the home page: clear our cookie, then end
    // Keycloak's SSO session (see keycloakLogoutUrl in auth.ts).
    const idToken = session?.idToken;
    await signOut({ redirect: false });
    redirect(keycloakLogoutUrl(idToken));
  }

  // The switcher in the top bar needs the list on every admin page. If the backend is
  // down the shell still renders (with the switcher saying so) and each page shows
  // its own error state.
  const campaigns = await loadCampaignsOrNull();

  return (
    <AdminShell
      user={{
        name: session.user?.name ?? session.user?.email ?? "Admin",
        email: session.user?.email,
        roles: session.roles,
      }}
      signOutAction={signOutAction}
      campaigns={campaigns}
      canCreate={canManageCampaigns(session.roles)}
    >
      {children}
    </AdminShell>
  );
}
