import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

export const GROUPS = {
  systemAdmin: "system-admin",
  selectionManager: "selection-manager",
  selectionOfficer: "selection-officer",
  committeeUser: "committee-user",
} as const;

export type Group = (typeof GROUPS)[keyof typeof GROUPS];

declare module "next-auth" {
  interface Session {
    roles: Group[];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    roles?: Group[];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      // AUTH_KEYCLOAK_ISSUER drives the token/userinfo/jwks exchange, which
      // this server performs itself — when running in Docker that's the
      // internal service address (http://keycloak:8080/...), unreachable
      // from outside the Docker network. The authorization endpoint, by
      // contrast, is a redirect the BROWSER must follow, so it needs the
      // publicly published address even when everything else here uses the
      // internal one. Outside Docker both env vars point at the same
      // localhost address, so this override is a no-op.
      authorization: `${process.env.AUTH_KEYCLOAK_PUBLIC_ISSUER ?? process.env.AUTH_KEYCLOAK_ISSUER}/protocol/openid-connect/auth`,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Keycloak's access token carries realm roles under realm_access.roles.
    // next-auth decodes the access token's claims onto the `profile` object
    // it receives from the provider, so we read them once at sign-in and
    // persist them onto our own JWT for every subsequent request.
    async jwt({ token, account }) {
      if (account?.access_token) {
        const payload = decodeJwtPayload(account.access_token);
        token.roles = (payload?.realm_access?.roles ?? []).filter(
          (role: string): role is Group =>
            Object.values(GROUPS).includes(role as Group),
        );
      }
      return token;
    },
    async session({ session, token }) {
      session.roles = token.roles ?? [];
      return session;
    },
  },
});

function decodeJwtPayload(jwt: string): { realm_access?: { roles?: string[] } } | null {
  try {
    const payload = jwt.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
