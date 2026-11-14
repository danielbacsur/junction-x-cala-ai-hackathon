import { NotFoundError } from "@fundraising/package-ledger";

import type { CandidateDetail, DeskSnapshot } from "@/lib/desk-types";
import { getLedger } from "@/lib/ledger";

/** Turns the ledger's "not yours, or not there" into null, and lets every other failure through. */
async function orNull<Result>(read: () => Promise<Result>): Promise<Result | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof NotFoundError) return null;

    throw error;
  }
}

export function loadDesk(mandateId: string, ownerId: string): Promise<DeskSnapshot | null> {
  return orNull(async () => {
    const ledger = getLedger();

    const [book, events, statement, packets] = await Promise.all([
      ledger.readBook(mandateId, ownerId),
      ledger.listWorkEvents(mandateId, ownerId),
      ledger.getStatement(mandateId, ownerId),
      ledger.listPackets(mandateId, ownerId),
    ]);

    return {
      book,
      events,
      statement,
      packets: packets.map(({ version, status, candidate, basedOnRevision, approvedAt, createdAt, withheld }) => ({
        version,
        status,
        candidate,
        basedOnRevision,
        approvedAt,
        createdAt,
        withheld: withheld.length,
      })),
      at: new Date().toISOString(),
    };
  });
}

export function loadCandidate(mandateId: string, ownerId: string, candidateId: string, withBrief: boolean): Promise<CandidateDetail | null> {
  return orNull(async () => {
    const ledger = getLedger();

    const [trails, brief] = await Promise.all([
      ledger.getTrails(mandateId, ownerId, candidateId),
      // A row can lose its brief between two reads; that is a missing brief, not a missing mandate.
      withBrief ? orNull(() => ledger.getBrief(mandateId, ownerId, candidateId)) : null,
    ]);

    return { trails, brief };
  });
}
