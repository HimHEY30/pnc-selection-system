import NextAuth, { customFetch } from "next-auth";
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
    // Needed server-side to build the Keycloak RP-initiated-logout URL (see
    // keycloakLogoutUrl below) - signOut() only clears our own cookie, not
    // Keycloak's SSO session, so logging out for real means sending the
    // browser to Keycloak's own end_session_endpoint with this as a hint.
    idToken?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    roles?: Group[];
    idToken?: string;
  }
}

// AUTH_KEYCLOAK_ISSUER is the issuer IDENTITY: Keycloak's KC_HOSTNAME pins
// every token's `iss` claim to this address regardless of how Keycloak was
// actually reached, so the browser's login (public address) and this
// server's token exchange (internal address, inside Docker) agree on one
// issuer. AUTH_KEYCLOAK_INTERNAL_ISSUER is only set inside Docker — when
// present, it's where this server should actually connect instead of the
// (unreachable-from-a-container) public address, without changing what
// issuer Auth.js expects back. Outside Docker there's no second var, so
// nothing is rewritten.
const internalIssuer = process.env.AUTH_KEYCLOAK_INTERNAL_ISSUER;

function dockerAwareFetch(publicOrigin: string, internalOrigin: string): typeof fetch {
  return (input, init) => {
    const requestUrl = input instanceof Request ? input.url : input;
    const url = new URL(requestUrl);
    if (url.origin === publicOrigin) {
      return fetch(`${internalOrigin}${url.pathname}${url.search}`, init);
    }
    return fetch(input, init);
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      ...(internalIssuer && {
        [customFetch]: dockerAwareFetch(
          new URL(process.env.AUTH_KEYCLOAK_ISSUER!).origin,
          new URL(internalIssuer).origin,
        ),
      }),
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
        token.idToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.roles = token.roles ?? [];
      session.idToken = token.idToken;
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

// signOut() by itself only deletes this app's own session cookie. Keycloak
// keeps its own SSO session alive (its KEYCLOAK_SESSION cookie, on
// Keycloak's own origin), so a user who "signs out" and then hits /login
// again gets silently re-authenticated with no login form - Keycloak still
// thinks they're logged in. RP-Initiated Logout is the OIDC mechanism for
// ending that session too: redirect the browser (not a server-to-server
// call - this has to happen in the browser, since it's Keycloak's cookie
// that needs clearing) to its end_session_endpoint. AUTH_KEYCLOAK_ISSUER is
// deliberately used here (not AUTH_KEYCLOAK_INTERNAL_ISSUER) since this URL
// is for the browser, which can't resolve the internal Docker address.
export function keycloakLogoutUrl(idToken: string | undefined): string {
  const params = new URLSearchParams({
    client_id: process.env.AUTH_KEYCLOAK_ID!,
    post_logout_redirect_uri: process.env.AUTH_URL!,
  });
  if (idToken) {
    params.set("id_token_hint", idToken);
  }
  return `${process.env.AUTH_KEYCLOAK_ISSUER}/protocol/openid-connect/logout?${params.toString()}`;
}
