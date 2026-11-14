import { GUEST_COOKIE, verifyGuest } from "@fundraising/package-ledger";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { mocked } from "@/lib/ledger";

export const GUEST_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * The secret guest cookies are signed with. The mock holds no customer data, so it may run on a
 * fixed one; everything else refuses to start without GUEST_SECRET.
 */
export function guestSecret() {
  const secret = process.env.GUEST_SECRET;

  if (secret) return secret;
  if (mocked()) return "bookrunner-mock-guest-secret";

  throw new Error("GUEST_SECRET is not set.");
}

/**
 * The guest this request belongs to, read from the signed cookie and never from anything the
 * client sends. Null when the cookie is missing or was not signed by us.
 *
 * Whatever is read for a guest is read per request: nothing behind this call may be prerendered
 * or prefetched for someone else.
 */
export async function currentGuest(): Promise<string | null> {
  await connection();

  const store = await cookies();

  return verifyGuest(store.get(GUEST_COOKIE)?.value, guestSecret());
}
