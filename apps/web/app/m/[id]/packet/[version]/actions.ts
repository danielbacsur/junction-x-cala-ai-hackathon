"use server";

import { NotFoundError, type PacketSections, type WithheldClaim } from "@fundraising/package-ledger";
import { redirect } from "next/navigation";

import { currentGuest } from "@/lib/guest";
import { getLedger } from "@/lib/ledger";

export type PacketState = { error: string | null };

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** One item per line. Empty lines are dropped, and list markers a person typed are not kept twice. */
const lines = (form: FormData, name: string) =>
  text(form, name)
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);

/**
 * Saves an edited packet as a new version. The ledger's checks run first: sentences the stored
 * evidence cannot carry are taken out and kept with the version, each with the reason, so the
 * owner sees what was withheld and why. Claims withheld from the version being edited stay
 * withheld. The new version is a draft and needs its own approval.
 */
export async function saveVersion(mandateId: string, fromVersion: number, _previous: PacketState, form: FormData): Promise<PacketState> {
  const ownerId = await currentGuest();

  if (!ownerId) return { error: "This browser no longer holds the cookie that owns the mandate." };

  let version: number;

  try {
    const ledger = getLedger();
    const current = await ledger.getPacket(mandateId, ownerId, fromVersion);

    const sections: PacketSections = {
      whyMeet: text(form, "whyMeet"),
      trail: text(form, "trail"),
      whyHesitate: text(form, "whyHesitate"),
      questions: lines(form, "questions"),
      agenda: lines(form, "agenda"),
      outreachDraft: text(form, "outreachDraft"),
      privateNotes: text(form, "privateNotes"),
    };

    const bundle = await ledger.getEvidenceBundle(mandateId, ownerId, current.candidate.id);
    const checked = await ledger.validatePacket(bundle, sections);

    const found = new Set(checked.withheld.map((claim) => claim.sentence));
    const withheld: WithheldClaim[] = [...checked.withheld, ...current.withheld.filter((claim) => !found.has(claim.sentence))];

    const saved = await ledger.savePacket({ mandateId, ownerId, candidateId: current.candidate.id, sections: checked.sections, withheld });

    version = saved.version;
  } catch (error) {
    if (error instanceof NotFoundError) return { error: "This packet is not open in this browser, or its candidate no longer has a brief." };

    console.error(error);

    return { error: "The packet was not saved: the ledger did not answer. Your text is still in the form. Try again." };
  }

  redirect(`/m/${mandateId}/packet/${version}?saved=${fromVersion}`);
}

/**
 * Approves exactly this version and marks the mandate delivered. A later edit makes a new version,
 * and that one is not approved by this.
 */
export async function approveVersion(mandateId: string, version: number): Promise<PacketState> {
  const ownerId = await currentGuest();

  if (!ownerId) return { error: "This browser no longer holds the cookie that owns the mandate." };

  try {
    const ledger = getLedger();

    await ledger.approvePacket(mandateId, ownerId, version);
    await ledger.setStage(mandateId, ownerId, "delivered");
  } catch (error) {
    if (error instanceof NotFoundError) return { error: "This packet is not open in this browser." };

    console.error(error);

    return { error: error instanceof Error && /newer version/i.test(error.message) ? error.message : "The packet was not approved: the ledger did not answer. Try again." };
  }

  redirect(`/m/${mandateId}/packet/${version}?approved=1`);
}
