import type { Book, BookRow, Brief, Packet, Statement, Trail, WorkEvent } from "@fundraising/package-ledger";

/** A packet version as the Desk lists it, without its text. */
export type PacketSummary = Pick<Packet, "version" | "status" | "candidate" | "basedOnRevision" | "approvedAt" | "createdAt"> & {
  withheld: number;
};

/** Everything the Desk redraws from: one consistent read of the ledger for one mandate. */
export type DeskSnapshot = {
  book: Book;
  events: WorkEvent[];
  statement: Statement;
  packets: PacketSummary[];
  /** The server's clock at the time of the read, so elapsed times do not depend on the browser's. */
  at: string;
};

/** The trails behind one Book row, and its brief when one has been written. */
export type CandidateDetail = {
  trails: Trail[];
  brief: Brief | null;
};

/** Changes whenever what is behind a row may have changed, so its detail is read again. */
export const detailKey = (row: BookRow) => `${row.candidate.id}|${row.revision}|${row.hasBrief ? 1 : 0}|${row.trailIds.join(",")}`;

/** The Desk shows this many briefs, as the engagement promises. */
export const BRIEFS = 3;
