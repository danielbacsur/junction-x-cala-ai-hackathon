"use server";

import { NotFoundError } from "@fundraising/package-ledger";

import { currentGuest } from "@/lib/guest";
import { getLedger } from "@/lib/ledger";
import { constraintsFrom } from "@/lib/scope";

/**
 * Binds the eve session the browser just started to its mandate, once. A mandate has one session:
 * if another tab got there first, that session's ID comes back and this tab should use it.
 */
export async function attachSession(mandateId: string, sessionId: string): Promise<{ sessionId: string | null }> {
  const ownerId = await currentGuest();

  if (!ownerId) return { sessionId: null };

  try {
    const ledger = getLedger();
    const mandate = await ledger.getMandate(mandateId, ownerId);

    if (mandate.sessionId) return { sessionId: mandate.sessionId };

    return { sessionId: (await ledger.attachSession(mandateId, ownerId, sessionId)).sessionId };
  } catch (error) {
    if (error instanceof NotFoundError) return { sessionId: null };

    throw error;
  }
}

export type ReviseState = { error: string | null; revision: number | null };

/**
 * Changes the criteria and reranks the Book from the store, with no new reads. The revision goes
 * up by one, and packets built before it say that they rest on older criteria.
 */
export async function reviseScope(mandateId: string, _previous: ReviseState, form: FormData): Promise<ReviseState> {
  const ownerId = await currentGuest();

  if (!ownerId) return { error: "This browser no longer holds the cookie that owns the mandate.", revision: null };

  try {
    const ledger = getLedger();
    const mandate = await ledger.getMandate(mandateId, ownerId);
    const book = await ledger.setConstraints(mandateId, ownerId, constraintsFrom(form, mandate.role));

    return { error: null, revision: book.mandate.revision };
  } catch (error) {
    if (error instanceof NotFoundError) return { error: "This mandate is not open in this browser.", revision: null };

    console.error(error);

    return { error: "The criteria were not saved: the ledger did not answer. The Book is unchanged. Try again.", revision: null };
  }
}
