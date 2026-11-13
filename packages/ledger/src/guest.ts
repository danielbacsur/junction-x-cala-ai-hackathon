import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * There is no login. The web app issues each browser a guest ID in a signed HttpOnly cookie,
 * and the agent verifies the same cookie, so both sides agree on who owns a mandate.
 */
export const GUEST_COOKIE = "bookrunner_guest";

function sign(guestId: string, secret: string) {
  return createHmac("sha256", secret).update(guestId).digest("base64url");
}

function secretFromEnv() {
  const secret = process.env.GUEST_SECRET;

  if (!secret) throw new Error("GUEST_SECRET is not set.");

  return secret;
}

/** A new cookie value, `<guestId>.<signature>`. */
export function issueGuest(secret = secretFromEnv()) {
  const guestId = randomUUID();

  return { guestId, value: `${guestId}.${sign(guestId, secret)}` };
}

/** The guest ID of a cookie value, or null when the value is missing or was not signed by us. */
export function verifyGuest(value: string | null | undefined, secret = secretFromEnv()) {
  if (!value) return null;

  const dot = value.lastIndexOf(".");
  const guestId = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(guestId, secret));

  if (dot < 1 || given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  return guestId;
}

/** Reads the guest ID out of a request's Cookie header. */
export function guestFromCookieHeader(header: string | null | undefined, secret = secretFromEnv()) {
  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (name === GUEST_COOKIE) return verifyGuest(decodeURIComponent(rest.join("=")), secret);
  }

  return null;
}
