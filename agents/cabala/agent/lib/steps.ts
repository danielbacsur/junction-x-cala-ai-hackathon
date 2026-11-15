/**
 * The durable steps of Cabala's workflow tools. A workflow body replays and must stay
 * deterministic, so every ledger call it needs is one of these: a step runs once, its result is
 * recorded, and a replay reuses the record.
 *
 * The workflow bundle keeps this module but not the step bodies, and it cannot hold Node.js
 * builtins. So the ledger is touched only inside a step, and helpers that reach it live in other
 * modules.
 */
import {
  CalaUnavailableError,
  type Constraints,
  type EntityRef,
  type EvidenceBundle,
  type PacketSections,
  type WithheldClaim,
} from "@fundraising/package-ledger";

import { compactCoverage } from "./compact";
import { getLedger } from "./ledger";
import { settle } from "./settle";
import { line } from "./worklog";

export async function loadMandate(mandateId: string, ownerId: string) {
  "use step";

  return settle(getLedger().getMandate(mandateId, ownerId));
}

/** Stores the scope the customer just confirmed, and says so in the work log. */
export async function confirmScope(mandateId: string, ownerId: string, constraints: Constraints | null, key: string) {
  "use step";

  const ledger = getLedger();
  const mandate = constraints
    ? (await settle(ledger.setConstraints(mandateId, ownerId, constraints))).mandate
    : await settle(ledger.getMandate(mandateId, ownerId));

  await ledger.logWork(mandateId, line("Scope confirmed by the customer", { key: `${key}:scope` }));

  return mandate;
}

export async function loadProposals(mandateId: string, ownerId: string) {
  "use step";

  return settle(getLedger().proposeProbes(mandateId, ownerId));
}

/** Before a pass: each probe Cabala chose goes into the work log with its reason. */
export async function logChoices(mandateId: string, chosen: { entity: EntityRef; reason: string }[], key: string) {
  "use step";

  const ledger = getLedger();

  for (const { entity, reason } of chosen) {
    await ledger.logWork(mandateId, line(`Chose to probe ${entity.name}: ${reason}`, { entity, key: `${key}:probe:${entity.id}` }));
  }
}

/**
 * One bounded pass. The ledger moves the stage, paces its requests and logs as it goes; a retry of
 * this step finds the earlier reads in the store. Cala going quiet is an outcome to report, not a
 * failure to retry. BOOKRUNNER_PASS_BUDGET lowers the ledger's ceiling of 25 requests; 0 keeps a
 * pass to the store.
 */
export async function runPass(mandateId: string, ownerId: string, probeEntityIds: string[], signal: AbortSignal) {
  "use step";

  const ceiling = process.env.BOOKRUNNER_PASS_BUDGET;

  try {
    const { mandate: _mandate, ...result } = await settle(
      getLedger().workMandate(mandateId, ownerId, {
        probeEntityIds,
        signal,
        ...(ceiling !== undefined && ceiling !== "" && { budget: Number(ceiling) }),
      }),
    );

    return { ...result, unavailable: null as string | null };
  } catch (error) {
    if (!(error instanceof CalaUnavailableError)) throw error;

    return { requestsUsed: 0, trailsFound: 0, rows: 0, partial: true, gaps: [] as string[], unavailable: error.message };
  }
}

/** The work log's newest lines since a cursor, for progress while a pass runs. */
export async function latestWork(mandateId: string, ownerId: string, afterId: string | null) {
  "use step";

  const events = await getLedger().listWorkEvents(mandateId, ownerId, afterId ?? undefined);

  return {
    cursor: events.at(-1)?.id ?? afterId,
    lines: events.slice(-3).map((event) => event.message),
    count: events.length,
  };
}

/**
 * After a pass: with trails in the list the ledger has left the mandate at Challenging, where the
 * conclusions are drawn; with none, the gaps are the result and the list is ready as it is. Also
 * reads which of the chosen probes did not run and what is left to probe.
 */
export async function endPass(
  mandateId: string,
  ownerId: string,
  pass: { chosen: string[]; unavailable: string | null },
  key: string,
) {
  "use step";

  const ledger = getLedger();

  if (pass.unavailable) {
    await ledger.logWork(mandateId, line(pass.unavailable, { kind: "outage", key: `${key}:outage` }));
  }

  const [book, proposals] = await Promise.all([ledger.readBook(mandateId, ownerId), ledger.proposeProbes(mandateId, ownerId)]);
  const hasTrails = book.rows.some((row) => row.trailIds.length > 0);
  const stage = hasTrails ? "challenging" : "ready";

  await settle(ledger.setStage(mandateId, ownerId, stage));

  if (stage === "ready") {
    await ledger.logWork(mandateId, line("Ready for your decision.", { kind: "stage", key: `${key}:ready` }));
  }

  const unprobed = proposals.filter((proposal) => !proposal.alreadyProbedAt);

  return {
    stage,
    hasTrails,
    coverage: compactCoverage(book.coverage),
    // A probe the ledger could not run leaves its entity among those not probed yet.
    probesNotRun: unprobed.filter((proposal) => pass.chosen.includes(proposal.entity.id)).map((proposal) => proposal.entity.name),
    notProbedYet: unprobed.slice(0, 6).map(({ entity, reason }) => ({ entityId: entity.id, name: entity.name, reason })),
  };
}

export async function loadBundle(mandateId: string, ownerId: string, candidateId: string) {
  "use step";

  return settle(getLedger().getEvidenceBundle(mandateId, ownerId, candidateId));
}

export async function loadPacket(mandateId: string, ownerId: string, version: number) {
  "use step";

  return settle(getLedger().getPacket(mandateId, ownerId, version));
}

export async function validateDraft(bundle: EvidenceBundle, sections: PacketSections) {
  "use step";

  return getLedger().validatePacket(bundle, sections);
}

/** The stored dossiers the second read asked for. One the store does not hold is left out. */
export async function loadDossiers(entityIds: string[]) {
  "use step";

  const ledger = getLedger();
  const dossiers = await Promise.all(entityIds.map((id) => ledger.getDossier(id).catch(() => null)));

  return dossiers.filter((dossier) => dossier !== null);
}

export async function savePacketVersion(input: {
  mandateId: string;
  ownerId: string;
  candidateId: string;
  sections: PacketSections;
  withheld: WithheldClaim[];
}) {
  "use step";

  return settle(getLedger().savePacket(input));
}

/**
 * Says in the work log that a version was saved. The ledger itself logs what each check withheld
 * from it and counts those lines in the statement of work, so only a second read that withheld
 * nothing is said here, as a note the statement does not count.
 */
export async function logPacket(
  mandateId: string,
  packet: { version: number; candidate: EntityRef },
  secondReadWithheld: number,
  key: string,
) {
  "use step";

  const ledger = getLedger();
  const { candidate: entity, version } = packet;

  if (secondReadWithheld === 0) {
    await ledger.logWork(
      mandateId,
      line(`Second read: 0 claims withheld (packet v${version})`, { entity, key: `${key}:second-read` }),
    );
  }

  await ledger.logWork(
    mandateId,
    line(`Packet version ${version} for ${entity.name} saved as a draft`, { entity, key: `${key}:saved` }),
  );
}
