import type { EvidenceBundle, PacketSections } from "@fundraising/package-ledger";
import type { WorkflowToolContext } from "eve/tools";
import { FatalError } from "eve/workflow";

import { compactPacket } from "./compact";
import { type DraftSections, draftSections, type SecondRead, secondRead } from "./schemas";
import { loadDossiers, logPacket, savePacketVersion, validateDraft } from "./steps";
import { numberDraft, strikeNumbered } from "./strike";

/** The second read may ask for this many stored dossiers per packet (consensus point 4). */
const EXTRA_READS = 3;

/** The bundle as a model may see it: the same evidence, without who owns the mandate or its session. */
function forModel(bundle: EvidenceBundle) {
  const { ownerId: _ownerId, sessionId: _sessionId, ...mandate } = bundle.mandate;

  return { ...bundle, mandate };
}

/** Every entity the bundle names, which is all the second read may ask to see more of. */
function entitiesIn(bundle: EvidenceBundle) {
  const { brief, mandate } = bundle;

  return new Set(
    [
      mandate.subject,
      brief.candidate,
      ...brief.trails.flatMap((trail) => trail.hops.flatMap((hop) => [hop.from, hop.to])),
      ...brief.ownership.map((owner) => owner.entity),
    ].map((entity) => entity.id),
  );
}

/**
 * Has Cabala write the packet's sections from the bundle. The writer is a copy of the root agent:
 * the same instructions and voice, a fresh conversation, and no tools, so the bundle is all it has.
 */
export async function writeSections(ctx: WorkflowToolContext, bundle: EvidenceBundle, guidance: string | undefined) {
  const response = await ctx.agent("agent").send(
    [
      `Write the meeting packet for ${bundle.brief.candidate.name}, for the ${bundle.mandate.role} mandate on ` +
        `${bundle.mandate.subject.name}. You have no tools here: the evidence bundle below is everything you may ` +
        "state. Follow the packet rules in your instructions and return the sections.",
      guidance ? `What the customer asked for in this packet: ${guidance}` : "",
      `Evidence bundle:\n${JSON.stringify(forModel(bundle))}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    { outputSchema: draftSections, signal: ctx.abortSignal },
  );
  const { data, error, status } = await response.result();

  if (status !== "completed" || !data) {
    throw new FatalError(`The packet was not written, so nothing was saved. ${error?.message ?? ""}`.trim());
  }

  return data;
}

/**
 * The second read: one schema-bound pass by the hidden subagent over the bundle, the trails and the
 * draft, all handed to it in the message. If it asks for stored dossiers it gets them once and
 * answers again.
 */
async function readAgain(ctx: WorkflowToolContext, bundle: EvidenceBundle, draft: DraftSections): Promise<SecondRead> {
  const session = ctx.agent("second-read");
  const ask = async (message: object) => {
    const response = await session.send(JSON.stringify(message), { outputSchema: secondRead, signal: ctx.abortSignal });
    const { data, error, status } = await response.result();

    if (status !== "completed" || !data) {
      throw new FatalError(`The second read did not finish, so no version was saved. ${error?.message ?? ""}`.trim());
    }

    return data;
  };

  const first = await ask({ bundle: forModel(bundle), trails: bundle.brief.trails, draft, numberedDraft: numberDraft(draft) });
  const known = entitiesIn(bundle);
  const wanted = [...new Set(first.reads.map((read) => read.entityId))].filter((id) => known.has(id)).slice(0, EXTRA_READS);

  if (wanted.length === 0) return first;

  return ask({ dossiers: await loadDossiers(wanted) });
}

/**
 * The second half of packet construction, shared by a new packet and an edit: the ledger's
 * deterministic checks, then the second read, then what either withheld is removed and the rest is
 * saved as a new draft version. Nothing here approves anything.
 */
export async function checkAndSave(
  ctx: WorkflowToolContext,
  input: { mandateId: string; ownerId: string; bundle: EvidenceBundle; sections: PacketSections },
) {
  const { bundle, mandateId, ownerId } = input;
  const validated = await validateDraft(bundle, input.sections);

  // The owner's private notes are not part of what the second read sees.
  const { privateNotes: _privateNotes, ...draft } = validated.sections;
  const reading = await readAgain(ctx, bundle, draft);
  const struck = strikeNumbered(validated.sections, reading.unsupported);
  const withheld = [...validated.withheld, ...struck.withheld];
  const packet = await savePacketVersion({
    mandateId,
    ownerId,
    candidateId: bundle.brief.candidate.id,
    sections: struck.sections,
    withheld,
  });

  await logPacket(mandateId, packet, struck.withheld.length, ctx.callId);

  return {
    saved: compactPacket(packet, bundle.mandate),
    sections: packet.sections,
    secondRead: {
      withheld: struck.withheld.length,
      missingCaveats: reading.missingCaveats,
      questions: reading.questions,
      ...(struck.unlocated.length > 0 && { notFoundInDraft: struck.unlocated }),
    },
    ...(struck.emptied.length > 0 && { emptied: struck.emptied }),
    next:
      "This version is a draft, and it supersedes every earlier version: an approval given to an earlier one does " +
      "not carry over. Tell the customer what was withheld and why, and what the second read still asks. Approval " +
      "is theirs to give, for exactly this version.",
  };
}
