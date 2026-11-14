import { GUEST_COOKIE, guestFromCookieHeader } from "@fundraising/package-ledger";
import { type AuthFn, ForbiddenError, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { sessions } from "eve/server";

import { GUEST_AUTHENTICATOR, GUEST_ISSUER } from "@/agent/lib/owner";

/** Marks a session whose first message did not come from a guest, so no guest may use it. */
const NOBODY = "";

/** Who started each session this process has looked up. A session's first sender never changes. */
const owners = new Map<string, string>();

/** The session a request addresses, or null on the routes that create one. */
function sessionIdOf(request: Request) {
  return /\/v1\/session\/([^/]+)/.exec(new URL(request.url).pathname)?.[1] ?? null;
}

/**
 * The guest whose message started a session, read from the session's own record. Null means
 * nothing is recorded yet, as for a session created without a first message.
 */
async function sessionOwner(sessionId: string) {
  const known = owners.get(sessionId);

  if (known !== undefined) return known;

  for await (const event of sessions.attach(sessionId).stream({ startIndex: 0, follow: false })) {
    if (event.type !== "delivery.admitted") continue;

    const sender = event.data.principal;
    const owner = sender?.type === "user" && sender.issuer === GUEST_ISSUER ? sender.id : NOBODY;

    owners.set(sessionId, owner);

    return owner;
  }

  return null;
}

/**
 * Accepts the web app's signed guest cookie and makes the guest the session principal. A guest
 * reaches only the sessions that guest started: eve keeps no access list per session, so the
 * check is made here, on every message, answer, control and stream read.
 */
const guest: AuthFn<Request> = async (request) => {
  const cookies = request.headers.get("cookie");

  if (!cookies?.includes(`${GUEST_COOKIE}=`) || !process.env.GUEST_SECRET) return null;

  const guestId = guestFromCookieHeader(cookies);

  if (!guestId) return null;

  const sessionId = sessionIdOf(request);
  const owner = sessionId ? await sessionOwner(sessionId) : null;

  if (owner !== null && owner !== guestId) {
    throw new ForbiddenError({ message: "This conversation belongs to someone else." });
  }

  return {
    attributes: {},
    authenticator: GUEST_AUTHENTICATOR,
    issuer: GUEST_ISSUER,
    principalId: guestId,
    principalType: "user",
  };
};

export default eveChannel({
  auth: [
    // The customer, identified by the cookie the web app signed.
    guest,

    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),

    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
  ],
});
