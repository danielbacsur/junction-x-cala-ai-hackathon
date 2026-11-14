import type { Book, Brief, EntityRef, Ledger, Mandate, WorkEvent } from "../contract";
import type { Db } from "../db";
import { createMandates } from "./mandates";
import { createPackets } from "./packets";
import { createWorkLog, type WorkEventInput } from "./work";

export { SupersededError } from "./packets";
export type { WorkEventInput } from "./work";

/**
 * The private store: mandates, the work log, the statement of work and meeting packets. Every
 * method that takes an ownerId answers a mandate that is missing and one that belongs to someone
 * else with the same NotFoundError.
 */
export type PrivateStore = Omit<
  Pick<
    Ledger,
    | "createMandate"
    | "getMandate"
    | "listMandates"
    | "attachSession"
    | "setStage"
    | "setConstraints"
    | "getEvidenceBundle"
    | "validatePacket"
    | "savePacket"
    | "approvePacket"
    | "getPacket"
    | "listPackets"
    | "exportPacket"
    | "logWork"
    | "listWorkEvents"
    | "getStatement"
  >,
  "logWork"
> & {
  /** The contract's logWork, which also takes a key that makes a retried line safe. */
  logWork(mandateId: string, event: WorkEventInput): Promise<WorkEvent>;
};

export function createPrivateStore(deps: {
  db: Db;
  /** Supplied by the research engine. */
  research: {
    entityRef(entityId: string): Promise<EntityRef>;
    rank(mandate: Mandate): Promise<void>;
    readBook(mandateId: string, ownerId: string): Promise<Book>;
    getBrief(mandateId: string, ownerId: string, candidateId: string): Promise<Brief>;
    evidenceCounts(mandateId: string): Promise<{ trails: number; sources: number }>;
  };
}): PrivateStore {
  return {
    ...createMandates(deps.db, deps.research),
    ...createWorkLog(deps.db, deps.research),
    ...createPackets(deps.db, deps.research),
  } satisfies Pick<Ledger, keyof PrivateStore>;
}
