import { NextResponse } from "next/server";
import { auth, GROUPS, type Group } from "@/auth";

// Route prefix -> groups allowed to access it. Checked top-to-bottom, first match wins.
// Anything not listed here only requires a signed-in session.
const PROTECTED_ROUTES: Array<{ prefix: string; allow: Group[] }> = [
  { prefix: "/admin", allow: [GROUPS.systemAdmin] },
  { prefix: "/committee", allow: [GROUPS.committeeUser, GROUPS.systemAdmin] },
];

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;

  if (!session) {
    // Our own auto-submitting page (app/login), not Auth.js's generic
    // multi-provider /api/auth/signin page - this app has one provider, so
    // skip straight to it instead of pausing on an extra button screen.
    const signInUrl = new URL("/login", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  const rule = PROTECTED_ROUTES.find((r) => nextUrl.pathname.startsWith(r.prefix));
  if (rule && !session.roles?.some((role) => rule.allow.includes(role))) {
    return NextResponse.redirect(new URL("/unauthorized", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Protect everything except static assets, the Next.js internals, and the
  // auth routes themselves (those must stay reachable to sign in at all).
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
