"use server";

import { CalaUnavailableError, NotFoundError, type Role } from "@fundraising/package-ledger";
import { redirect } from "next/navigation";

import { currentGuest } from "@/lib/guest";
import { getLedger } from "@/lib/ledger";
import { constraintsFrom } from "@/lib/scope";

export type HireState = { error: string | null };

/**
 * Opens a mandate with the scope the customer confirmed, then moves to its Desk. The owner is
 * the guest of the signed cookie; nothing the form sends can name another one.
 */
export async function hire(_previous: HireState, form: FormData): Promise<HireState> {
  const ownerId = await currentGuest();

  if (!ownerId) return { error: "Your browser is not accepting the cookie that keeps a mandate yours. Allow cookies for this site and try again." };

  const role: Role = form.get("role") === "investor" ? "investor" : "founder";
  const subjectId = String(form.get("subjectId") ?? "");

  if (!subjectId) return { error: "Choose your company or fund first." };

  const constraints = constraintsFrom(form, role);

  let mandateId: string;

  try {
    mandateId = (await getLedger().createMandate({ ownerId, role, subjectId, constraints })).id;
  } catch (error) {
    if (error instanceof NotFoundError) return { error: "Cala no longer has an entity under that ID. Search again and pick it from the list." };

    if (error instanceof CalaUnavailableError) {
      return { error: "Cala is not answering, and nothing about this entity is stored yet. The mandate was not opened. Try again in a few minutes." };
    }

    console.error(error);

    return { error: "The mandate could not be opened: the ledger did not answer. Nothing was saved. Try again." };
  }

  redirect(`/m/${mandateId}`);
}
