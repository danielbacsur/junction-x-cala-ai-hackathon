import type { SessionAuth } from "eve/context";

/** How the channel names a caller it verified from the web app's signed guest cookie. */
export const GUEST_AUTHENTICATOR = "bookrunner-guest";
export const GUEST_ISSUER = "bookrunner";

/** Thrown when a tool is called by anyone the guest cookie did not identify. */
export class NoOwnerError extends Error {
  constructor() {
    super(
      "No owner: this session carries no verified guest identity, so nothing can be read or changed. " +
        "The customer has to open the mandate from the Cabala web app.",
    );
  }
}

/**
 * The owner every ledger call is made for: the guest of the turn's caller, as the channel verified
 * it. It never comes from the model, and local-dev or service callers are not owners.
 */
export function ownerOf(session: { auth: SessionAuth }) {
  const caller = session.auth.current;

  if (caller?.authenticator !== GUEST_AUTHENTICATOR || !caller.principalId) throw new NoOwnerError();

  return caller.principalId;
}
