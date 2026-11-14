import type { Brief, EvidenceBundle, EvidenceKind, Mandate, Signal, SourceRef, Trail } from "../contract";
import { hopWords, sentence, signalWords, uniqueSources } from "./words";

/** The customer's own criteria, as statements a packet may repeat. They are Self-reported. */
function selfReported(mandate: Mandate): string[] {
  const { constraints } = mandate;
  const statements: string[] = [];

  if (constraints.stages?.length) statements.push(`Stage: ${constraints.stages.join(", ")}.`);
  if (constraints.sectors?.length) statements.push(`Sector: ${constraints.sectors.join(", ")}.`);
  if (constraints.geographies?.length) statements.push(`Geography: ${constraints.geographies.join(", ")}.`);
  if (constraints.exclusions?.length) statements.push(`Ruled out: ${constraints.exclusions.join(", ")}.`);

  if (constraints.includeExistingBackers !== null) {
    statements.push(
      constraints.includeExistingBackers
        ? "Existing backers are wanted as follow-up targets."
        : "Existing backers are not wanted in the Book.",
    );
  }

  if (constraints.includePublicFunding !== null) {
    statements.push(
      constraints.includePublicFunding
        ? "Public funders are wanted as a separate non-dilutive category."
        : "Public funders are not wanted in the Book.",
    );
  }

  if (constraints.notes) statements.push(constraints.notes);

  return statements;
}

function trailSources(trail: Trail): SourceRef[] {
  return [...trail.hops.flatMap((hop) => hop.sources), ...(trail.signal?.sources ?? [])];
}

/**
 * Turns a brief into everything a packet may state. Hops and signals are Observed, in the fixed
 * wording of words.ts; a derived one also quotes Cala's claim. What Cabala concluded from a trail
 * is Inferred, its limits are Still unknown, and the customer's criteria are Self-reported.
 */
export function buildBundle(mandate: Mandate, brief: Brief): EvidenceBundle {
  const supportedFacts: EvidenceBundle["supportedFacts"] = [];
  const seen = new Set<string>();

  function add(statement: string, kind: EvidenceKind, sources: SourceRef[]) {
    const text = statement.trim();

    if (!text || seen.has(`${kind}|${text}`)) return;

    seen.add(`${kind}|${text}`);
    supportedFacts.push({ statement: text, kind, sources: uniqueSources(sources) });
  }

  function addSignal(signal: Signal) {
    add(sentence(signalWords(signal)), "observed", signal.sources);

    if (signal.claim) add(`Cala reports: "${signal.claim}"`, "observed", signal.sources);
  }

  for (const line of brief.whyMeet) add(line.statement, line.kind, line.sources);

  for (const trail of brief.trails) {
    for (const hop of trail.hops) {
      add(sentence(hopWords(hop)), "observed", hop.sources);

      if (hop.claim) add(`Cala reports: "${hop.claim}"`, "observed", hop.sources);
    }

    if (trail.signal) addSignal(trail.signal);

    if (trail.conclusion) {
      add(trail.conclusion.reading, "inferred", trailSources(trail));
      add(trail.conclusion.because, "inferred", trailSources(trail));
      add(trail.conclusion.doesNotProve, "unknown", []);
    }
  }

  for (const signal of brief.directSignals) addSignal(signal);

  for (const owner of brief.ownership) {
    add(
      `Ownership context for ${brief.candidate.name}: ${owner.entity.name} (${owner.relation}).`,
      "observed",
      owner.sources,
    );

    for (const signal of owner.signals) addSignal(signal);
  }

  for (const line of brief.whyHesitate) add(line.statement, line.kind, line.sources);
  for (const unknown of brief.stillUnknown) add(unknown, "unknown", []);
  for (const statement of selfReported(mandate)) add(statement, "self_reported", []);

  return { mandate, brief, supportedFacts };
}
