/**
 * Shapes ledger records for the model: names where the ledger has IDs, one line where it has an
 * object, and the wording rule beside the fact it governs. Nothing is added to what the ledger
 * returned.
 */
import type {
  Book,
  BookRow,
  Brief,
  Constraints,
  Coverage,
  FitLine,
  Hop,
  Mandate,
  Packet,
  Signal,
  SourceRef,
  Trail,
} from "@fundraising/package-ledger";

const SOURCES_SHOWN = 3;

function cited(sources: SourceRef[]) {
  const shown = sources
    .slice(0, SOURCES_SHOWN)
    .map((source) => [source.name, source.date, source.rank, source.url].filter(Boolean).join(", "));

  return sources.length > SOURCES_SHOWN ? [...shown, `and ${sources.length - SOURCES_SHOWN} more`] : shown;
}

/** One hop as a sentence that already follows the direction rule of consensus point 16.3. */
function says(hop: Hop) {
  switch (hop.direction) {
    case "from_funds_to":
      return `${hop.from.name} funded ${hop.to.name}; roles in one transaction settle the direction.`;
    case "to_funds_from":
      return `${hop.to.name} funded ${hop.from.name}; roles in one transaction settle the direction.`;
    case "undirected":
      return (
        `${hop.from.name} and ${hop.to.name} are tied (${hop.relationship}). The direction is not settled: ` +
        "say they are connected, never that one funded, backed or invested in the other."
      );
    default:
      return hop.origin === "derived"
        ? `${hop.from.name} and ${hop.to.name}: ${hop.relationship}, reported by Cala from the documents cited.`
        : `${hop.from.name} ${hop.relationship} ${hop.to.name}.`;
  }
}

export function compactSignal(signal: Signal) {
  return {
    id: signal.id,
    type: signal.type,
    on: signal.entity.name,
    label: signal.label,
    date: signal.date ? `${signal.date} (${signal.dateKind ?? "kind of date unknown"})` : null,
    amount: signal.value === null ? null : `${signal.units ?? ""} ${signal.value}`.trim(),
    ...(signal.valueIsProgrammeCeiling && {
      amountIs: "A programme ceiling shared by all awardees, not this party's amount. Never give it as their contract value.",
    }),
    instrument: signal.instrument,
    parties: signal.parties.map((party) => `${party.entity.name}${party.role ? ` (${party.role})` : ""}`),
    origin: signal.origin === "derived" ? "derived: reported by Cala from the documents cited" : "native: from the graph",
    ...(signal.claim && { claim: signal.claim }),
    ...(signal.publicBasis && {
      public: `${signal.publicBasis.basis} ${signal.publicBasis.ours ? "This is our classification." : "Cala's description says so."}`,
    }),
    ...(signal.flag && { flag: `${signal.flag} Context only; leave it out of any recency comparison.` }),
    sources: cited(signal.sources),
  };
}

export function compactTrail(trail: Trail) {
  const names = new Map(
    [trail.subject, ...trail.hops.flatMap((hop) => [hop.from, hop.to])].map((entity) => [entity.id, entity.name]),
  );
  const named = (ids: string[]) => ids.map((id) => names.get(id) ?? id);

  return {
    id: trail.id,
    pattern: trail.pattern,
    connections: trail.hopCount,
    path: [trail.subject.name, ...trail.hops.map((hop) => hop.to.name)].join(" — "),
    hops: trail.hops.map((hop) => ({
      says: says(hop),
      ...(hop.role && { role: hop.role }),
      ...(hop.claim && { claim: hop.claim }),
      ...(hop.validSince && { since: hop.validSince }),
      sources: cited(hop.sources),
    })),
    signal: trail.signal ? compactSignal(trail.signal) : null,
    independentTrails: trail.independentTrails,
    weakestSourceRank: trail.weakestSourceRank,
    readInFull: named(trail.readInFull),
    seenInListOnly: named(trail.seenInListOnly),
    conclusion: trail.conclusion,
  };
}

function compactFit(line: FitLine) {
  return { criterion: line.criterion, statement: line.statement, kind: line.kind, sources: cited(line.sources) };
}

export function compactRow(row: BookRow) {
  return {
    rank: row.rank,
    candidateId: row.candidate.id,
    candidate: row.candidate.name,
    category: row.category,
    reason: row.reason,
    ...(row.directFitOnly && { directFitOnly: "No connection to the subject or its anchors is demonstrated. Say so." }),
    bestTrail: row.bestTrail
      ? `${row.bestTrail.pattern}, ${row.bestTrail.hopCount} connections` +
        (row.bestTrail.signalLabel ? `, ${row.bestTrail.signalLabel}` : "")
      : null,
    trailIds: row.trailIds,
    enrichment: row.enrichment,
    fit: row.fit.map(({ criterion, statement, kind }) => ({ criterion, statement, kind })),
    unknowns: row.unknowns,
    hasBrief: row.hasBrief,
  };
}

export function compactMandate(mandate: Mandate) {
  return {
    id: mandate.id,
    role: mandate.role,
    subject: { id: mandate.subject.id, name: mandate.subject.name },
    stage: mandate.stage,
    revision: mandate.revision,
    constraints: mandate.constraints,
  };
}

export function compactCoverage(coverage: Coverage) {
  return {
    roster: `${coverage.rosterSize} Slush attendees listed by Cala, fetched ${coverage.rosterFetchedAt ?? "at an unknown time"}`,
    readInFull: coverage.entitiesReadInFull,
    hubsRead: coverage.hubsRead,
    probesStored: coverage.probesStored,
    cala:
      coverage.cala === "answering"
        ? "answering"
        : `Cala is not answering; showing stored evidence from ${coverage.newestFetchAt ?? "an unknown time"}`,
  };
}

export function compactBook(book: Book) {
  return {
    mandate: compactMandate(book.mandate),
    rows: book.rows.map(compactRow),
    coverage: compactCoverage(book.coverage),
    gaps: book.gaps,
  };
}

export function compactBrief(brief: Brief) {
  return {
    candidateId: brief.candidate.id,
    candidate: brief.candidate.name,
    category: brief.category,
    revision: brief.revision,
    whyMeet: brief.whyMeet.map(compactFit),
    whyHesitate: brief.whyHesitate.map(compactFit),
    trails: brief.trails.map(compactTrail),
    directSignals: brief.directSignals.map(compactSignal),
    ownership: brief.ownership.map((owner) => ({
      relation: owner.relation,
      entity: owner.entity.name,
      signals: owner.signals.map(compactSignal),
      sources: cited(owner.sources),
    })),
    questions: brief.questions,
    stillUnknown: brief.stillUnknown,
    coverageNote: brief.coverageNote,
  };
}

export function compactPacket(packet: Packet, mandate: Mandate) {
  return {
    version: packet.version,
    candidateId: packet.candidate.id,
    candidate: packet.candidate.name,
    status: packet.status,
    approvedAt: packet.approvedAt,
    ...(packet.basedOnRevision < mandate.revision && {
      stale: `Built on revision ${packet.basedOnRevision}; the criteria are now at revision ${mandate.revision}.`,
    }),
    withheld: packet.withheld,
  };
}

/** The scope as the customer reads it when asked to confirm. Unknowns are said, not skipped. */
export function describeScope(mandate: Mandate, constraints: Constraints) {
  const some = (values: string[] | null) => (values?.length ? values.join(", ") : "not stated");
  const yesNo = (value: boolean | null) => (value === null ? "not stated" : value ? "yes" : "no");
  const lines = [
    mandate.role === "founder"
      ? `Raise mandate for ${mandate.subject.name}: investors worth approaching, with the trail behind each.`
      : `Sourcing mandate for ${mandate.subject.name}: companies worth a first meeting, with the trail behind each.`,
    `Stage: ${some(constraints.stages)}`,
    `Sector: ${some(constraints.sectors)}`,
    `Geography: ${some(constraints.geographies)}`,
    `Excluded: ${constraints.exclusions?.length ? constraints.exclusions.join(", ") : "nobody"}`,
  ];

  if (mandate.role === "founder") {
    lines.push(
      `Existing backers as follow-ups: ${yesNo(constraints.includeExistingBackers)}`,
      `Public funders as a separate list: ${yesNo(constraints.includePublicFunding)}`,
    );
  }

  if (constraints.notes) lines.push(`Your notes: ${constraints.notes}`);

  lines.push(
    "You get a ranked Book within what I can read, up to three briefs where the evidence carries them, and one " +
      "meeting packet with one revision. I prepare meetings; I do not arrange them.",
  );

  return lines.join("\n");
}
