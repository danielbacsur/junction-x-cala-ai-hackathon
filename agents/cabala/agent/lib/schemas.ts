import { z } from "zod";

export const mandateId = z.string().min(1).describe("The mandate's ID, as given in the customer's first message.");

export const candidateId = z.string().min(1).describe("The candidate's Cala entity ID, from the list.");

const list = z.array(z.string().min(1)).nullable();

/** The scope of a mandate. Null means the customer has not said, and stays unknown. */
export const constraints = z.object({
  stages: list.describe("Funding stages wanted, such as Seed or Series A. Null when not stated."),
  sectors: list.describe("Sectors wanted. Null when not stated."),
  geographies: list.describe("Countries or regions wanted. Null when not stated."),
  exclusions: list.describe("Entity names or Cala IDs the customer rules out. Null when there are none."),
  includeExistingBackers: z
    .boolean()
    .nullable()
    .describe("Founder mandates: list existing backers as follow-up targets. Null when not stated."),
  includePublicFunding: z
    .boolean()
    .nullable()
    .describe("Founder mandates: list public funders as a separate non-dilutive category. Null when not stated."),
  notes: z.string().nullable().describe("The customer's own words on what they want. Shown as Self-reported."),
});

/** What Cabala makes of one trail (consensus point 16.6). */
export const conclusion = z.object({
  trailId: z.string().min(1).describe("The trail's ID, from get_trails."),
  reading: z.string().min(1).describe("One Inferred sentence: what the trail suggests for a meeting."),
  because: z.string().min(1).describe("The hops and the signal the reading rests on, as the trail states them."),
  doesNotProve: z.string().min(1).describe("One sentence of limits: what the trail does not establish."),
  ask: z.string().min(1).describe("One question or action for the meeting."),
});

/** The sections of a packet that Cabala writes. Private notes are the owner's and are kept apart. */
export const draftSections = z.object({
  whyMeet: z.string().describe("Why this meeting is worth taking, from the evidence."),
  trail: z.string().describe("The trail behind it, hop by hop, each with what it is and where it comes from."),
  whyHesitate: z.string().describe("The limits, unknowns and objections to arrive prepared for."),
  questions: z.array(z.string()).describe("Questions to ask in the meeting."),
  agenda: z.array(z.string()).describe("A short agenda."),
  outreachDraft: z.string().describe("A short first message the owner could send. It promises nothing."),
});

export const sectionEdits = draftSections
  .extend({ privateNotes: z.string().describe("Owner-only notes. They never leave the owner's view.") })
  .partial();

const section = z.enum(["whyMeet", "trail", "whyHesitate", "questions", "agenda", "outreachDraft"]);

/** What the second read returns. It judges the draft against the evidence and writes no prose. */
export const secondRead = z.object({
  unsupported: z
    .array(
      z.object({
        section,
        sentenceId: z.number().int().positive().describe("The sentence ID from numberedDraft."),
        sentence: z.string().describe("The sentence or list item, copied exactly from the draft."),
        reason: z.string().describe("What the evidence does and does not say, in one sentence."),
      }),
    )
    .describe("Factual sentences the evidence does not support as written."),
  missingCaveats: z
    .array(z.object({ section, caveat: z.string() }))
    .describe("Limits the evidence states that the draft leaves out."),
  questions: z.array(z.string()).describe("Open questions the writer should resolve before the packet is used."),
  reads: z
    .array(z.object({ entityId: z.string(), why: z.string() }))
    .describe("At most three entities from the evidence whose stored dossier is needed to judge a sentence. Usually empty."),
});

export type DraftSections = z.infer<typeof draftSections>;
export type SecondRead = z.infer<typeof secondRead>;
