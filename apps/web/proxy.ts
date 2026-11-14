import { GUEST_COOKIE, NotFoundError, issueGuest, verifyGuest } from "@fundraising/package-ledger";
import { NextResponse, type NextRequest } from "next/server";

import { GUEST_COOKIE_OPTIONS, guestSecret } from "@/lib/guest";
import { getLedger } from "@/lib/ledger";

/** True when the mandate exists and is this guest's. Anything else the ledger says is left to the page. */
async function missing(mandateId: string, guestId: string) {
  try {
    await getLedger().getMandate(mandateId, guestId);

    return false;
  } catch (error) {
    return error instanceof NotFoundError;
  }
}

/**
 * There is no login: every browser gets a guest ID in a signed HttpOnly cookie on its first
 * request, and the same request already sees it. A mandate page is checked against that guest
 * here, before anything streams, because afterwards the response can no longer become a 404.
 */
export async function proxy(request: NextRequest) {
  const secret = guestSecret();

  let guestId = verifyGuest(request.cookies.get(GUEST_COOKIE)?.value, secret);
  let issued: string | null = null;

  if (!guestId) {
    const guest = issueGuest(secret);

    guestId = guest.guestId;
    issued = guest.value;
    request.cookies.set(GUEST_COOKIE, issued);
  }

  const mandateId = /^\/m\/([^/]+)/.exec(request.nextUrl.pathname)?.[1];

  // A guest issued a moment ago owns nothing yet.
  if (mandateId && (issued || (await missing(mandateId, guestId)))) {
    const response = NextResponse.rewrite(new URL("/not-found", request.url), { status: 404 });

    if (issued) response.cookies.set(GUEST_COOKIE, issued, GUEST_COOKIE_OPTIONS);

    return response;
  }

  // Every other request passes through untouched. Handing the request headers back would drop the
  // ones Next.js hides from this file, and a client navigation would then be answered with a page.
  if (!issued) return NextResponse.next();

  const response = NextResponse.next({ request: { headers: request.headers } });

  response.cookies.set(GUEST_COOKIE, issued, GUEST_COOKIE_OPTIONS);

  return response;
}

// Pages and route handlers have no dot in their path; everything that does is a file. /eve is the
// agent's API, which reaches this app only in local development, on its way to a rewrite.
export const config = {
  matcher: ["/((?!_next/|_vercel/|eve/|.*\\..*).*)"],
};
