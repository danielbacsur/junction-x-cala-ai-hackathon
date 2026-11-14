import { randomUUID } from "node:crypto";

import { GUEST_COOKIE, issueGuest } from "@fundraising/package-ledger";

/**
 * Request headers of a new guest, carrying the cookie the web app would have signed. The agent
 * under test must hold the same GUEST_SECRET; `eve eval` gives both the one in `.env.local`.
 */
export function guest() {
  if (!process.env.GUEST_SECRET) process.loadEnvFile(".env.local");

  return { cookie: `${GUEST_COOKIE}=${encodeURIComponent(issueGuest().value)}` };
}

/**
 * The ID of a mandate in the in-memory ledger that only the calling eval uses. A founder mandate
 * is Redpine's and an investor mandate is OTB Ventures'. A ready one starts with its research
 * done; the investor's then also holds a draft packet for Kuva Space as version 1.
 */
export function fakeMandate(role: "founder" | "investor", ready = false) {
  const scenario = role === "founder" ? "founder-redpine" : "investor-otb";

  return `fake-${ready ? "ready-" : ""}${scenario}-${randomUUID().slice(0, 8)}`;
}

/** Cala entity IDs of the seeded candidates the evals name. */
export const ENOVA = "76d8c340-04bf-474a-b8c6-00c4e8438b79";
export const KUVA_SPACE = "41f89a61-54ac-4068-82af-a2d2096efcfc";
