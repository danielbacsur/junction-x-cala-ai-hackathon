import type { EvidenceKind, Mandate, Packet, SourceRef, Trail } from "../contract";
import type { FrozenEvidence } from "./packets";
import { hopWords, PATTERNS, sentence, signalWords, uniqueSources } from "./words";

// The customer's own criteria are Self-reported and stay in the owner's view, like the notes: a
// packet is handed to the other side, and a mandate's criteria are not written for them.
const KINDS: [EvidenceKind, string][] = [
  ["observed", "Observed"],
  ["inferred", "Inferred"],
  ["unknown", "Still unknown"],
];

/** One source as a link. A part Cala did not supply stays missing; nothing is filled in. */
function sourceLink(source: SourceRef) {
  const label = (source.name ?? source.url ?? "Unnamed source").replace(/[[\]]/g, "\\$&");
  const details = [source.date, source.rank].filter(Boolean).join(", ");

  // Only web addresses become links, with the characters that would end a Markdown link encoded.
  const isWeb = source.url !== null && /^https?:\/\//i.test(source.url);
  const url = isWeb ? source.url!.replace(/[()\s<>]/g, encodeURIComponent) : null;

  return `${url ? `[${label}](${url})` : `${label} (no link in Cala's record)`}${details ? ` (${details})` : ""}`;
}

function sourceLine(sources: SourceRef[]) {
  const unique = uniqueSources(sources);

  return unique.length > 0 ? `Sources: ${unique.map(sourceLink).join("; ")}` : "Sources: none in Cala's record";
}

function trailLines(trail: Trail, index: number): string[] {
  const hops = trail.hopCount === 1 ? "1 hop" : `${trail.hopCount} hops`;
  const lines = [`### Trail ${index + 1}: ${PATTERNS[trail.pattern] ?? trail.pattern}, ${hops}`, ""];

  trail.hops.forEach((hop, position) => {
    lines.push(`${position + 1}. ${sentence(hopWords(hop))}`);

    lines.push(
      hop.origin === "derived"
        ? `   - Derived from a claim Cala reports${hop.claim ? `: "${hop.claim}"` : "."}`
        : `   - Observed in Cala's graph as ${hop.relationship}.`,
    );

    lines.push(`   - ${sourceLine(hop.sources)}`);
  });

  if (trail.signal) {
    lines.push("", `**Signal.** ${sentence(signalWords(trail.signal))}`);

    if (trail.signal.claim) lines.push("", `Reported by Cala: "${trail.signal.claim}"`);

    lines.push("", sourceLine(trail.signal.sources));
  }

  const names = new Map(trail.hops.flatMap((hop) => [hop.from, hop.to]).map((entity) => [entity.id, entity.name]));
  const listed = (ids: string[]) => ids.map((id) => names.get(id) ?? id).join(", ");

  if (trail.readInFull.length > 0) lines.push("", `Read in full: ${listed(trail.readInFull)}.`);

  if (trail.seenInListOnly.length > 0) {
    lines.push("", `Seen only in another entity's list: ${listed(trail.seenInListOnly)}.`);
  }

  if (trail.weakestSourceRank) lines.push("", `Weakest source on this trail: ${trail.weakestSourceRank}.`);

  if (trail.conclusion) {
    lines.push(
      "",
      `**Reading (Inferred).** ${trail.conclusion.reading}`,
      "",
      `**It rests on.** ${trail.conclusion.because}`,
      "",
      `**It does not prove.** ${trail.conclusion.doesNotProve}`,
      "",
      `**To ask.** ${trail.conclusion.ask}`,
    );
  }

  return [...lines, ""];
}

function statusLine(packet: Packet) {
  if (packet.status === "approved") return `approved on ${packet.approvedAt}`;
  if (packet.status === "draft") return "draft, not approved";

  return packet.approvedAt
    ? `replaced by a later version (it was approved on ${packet.approvedAt})`
    : "replaced by a later version";
}

/**
 * The packet as Markdown: the sections, each trail hop by hop with its sources, the evidence
 * split into Observed, Inferred and Still unknown, and the coverage note. The owner's private
 * notes and the mandate's criteria are not read here at all, so they cannot reach the file.
 */
export function renderPacket(mandate: Mandate, packet: Packet, evidence: FrozenEvidence): string {
  const { sections } = packet;
  const prose = (text: string) => text.trim() || "_Nothing is stated here._";
  const list = (items: string[]) => (items.length > 0 ? items : ["_None._"]);

  const lines = [
    `# Meeting packet: ${packet.candidate.name}`,
    "",
    `Prepared for ${mandate.subject.name}, ${mandate.role === "founder" ? "Raise Mandate" : "Sourcing Mandate"}.`,
    `Version ${packet.version}, ${statusLine(packet)}.`,
    mandate.revision > packet.basedOnRevision
      ? `Built on revision ${packet.basedOnRevision} of the mandate's criteria. The criteria have changed since (now revision ${mandate.revision}), so this packet rests on older criteria.`
      : `Built on revision ${packet.basedOnRevision} of the mandate's criteria.`,
    "",
    "## Why meet",
    "",
    prose(sections.whyMeet),
    "",
    "## The trail",
    "",
    prose(sections.trail),
    "",
  ];

  if (packet.trails.length === 0) {
    lines.push("No trail connects the two in the stored evidence. This recommendation is a direct fit only.", "");
  }

  packet.trails.forEach((trail, index) => lines.push(...trailLines(trail, index)));

  lines.push("## Why hesitate", "", prose(sections.whyHesitate), "");
  lines.push("## Questions", "", ...list(sections.questions.map((item) => `- ${item}`)), "");
  lines.push("## Agenda", "", ...list(sections.agenda.map((item, index) => `${index + 1}. ${item}`)), "");
  lines.push("## Outreach draft", "", prose(sections.outreachDraft), "");
  lines.push("## Evidence", "");

  for (const [kind, title] of KINDS) {
    const facts = evidence.facts.filter((fact) => fact.kind === kind);

    // The three kinds always appear, so an empty one reads as empty and not as left out.
    lines.push(`### ${title}`, "");

    if (facts.length === 0) lines.push("_None._");

    for (const fact of facts) {
      lines.push(`- ${fact.statement}`);

      if (fact.sources.length > 0) lines.push(`  - ${sourceLine(fact.sources)}`);
    }

    lines.push("");
  }

  lines.push("## Coverage", "", evidence.coverageNote.trim() || "_No coverage note was recorded._", "");

  lines.push(
    "---",
    "",
    "Built with Cala. Facts and connections are reported by Cala from the linked sources. Readings marked Inferred are Cabala's, and each says what it does not prove.",
    "",
  );

  return lines.join("\n");
}
