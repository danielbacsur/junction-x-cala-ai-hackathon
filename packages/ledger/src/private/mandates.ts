import { randomUUID } from "node:crypto";

import {
  type Book,
  type Constraints,
  type EntityRef,
  type Ledger,
  type Mandate,
  type MandateStage,
  NotFoundError,
  type Role,
} from "../contract";
import type { Db } from "../db";

/** What the private store needs from the research engine. */
export type Research = {
  entityRef(entityId: string): Promise<EntityRef>;
  rank(mandate: Mandate): Promise<void>;
  readBook(mandateId: string, ownerId: string): Promise<Book>;
  getBrief: Ledger["getBrief"];
  evidenceCounts(mandateId: string): Promise<{ trails: number; sources: number }>;
};

type MandateRow = {
  id: string;
  owner_id: string;
  role: Role;
  subject: EntityRef;
  constraints: Constraints;
  revision: number;
  stage: MandateStage;
  session_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const ROLES: Role[] = ["founder", "investor"];
const STAGES: MandateStage[] = ["brief_received", "researching", "challenging", "ready", "delivered"];

/** Timestamps come back as strings from node-postgres and as Dates from PGlite. */
export function iso(value: Date | string) {
  return new Date(value).toISOString();
}

/** JSON with sorted keys, so two values compare equal whatever order their keys were written in. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );
}

export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

function toMandate(row: MandateRow): Mandate {
  return {
    id: row.id,
    ownerId: row.owner_id,
    role: row.role,
    subject: row.subject,
    constraints: row.constraints,
    revision: row.revision,
    stage: row.stage,
    sessionId: row.session_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** One error for a missing mandate and for somebody else's, so an ID cannot be probed. */
function notFound() {
  return new NotFoundError("Mandate not found.");
}

/**
 * The mandate, if this owner holds it. With `lock`, the row is held until the transaction ends,
 * which puts everything written for one mandate (versions, approvals, log lines) in one queue.
 */
export async function ownedMandate(db: Db, mandateId: string, ownerId: string, lock = false): Promise<Mandate> {
  const [row] = await db.query<MandateRow>(
    `select * from mandates where id = $1 and owner_id = $2${lock ? " for no key update" : ""}`,
    [mandateId, ownerId],
  );

  if (!row) throw notFound();

  return toMandate(row);
}

/** Holds a mandate's row for trusted code, which has no owner to check. */
export async function lockMandate(tx: Db, mandateId: string): Promise<void> {
  const [row] = await tx.query("select id from mandates where id = $1 for no key update", [mandateId]);

  if (!row) throw notFound();
}

function cleanList(values: string[] | null | undefined) {
  if (!Array.isArray(values)) return null;

  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

/** Keeps the known fields only. An unknown stays null; it never becomes an empty answer. */
function cleanConstraints(constraints: Constraints): Constraints {
  return {
    stages: cleanList(constraints.stages),
    sectors: cleanList(constraints.sectors),
    geographies: cleanList(constraints.geographies),
    exclusions: cleanList(constraints.exclusions),
    includeExistingBackers: constraints.includeExistingBackers ?? null,
    includePublicFunding: constraints.includePublicFunding ?? null,
    notes: constraints.notes?.trim() || null,
  };
}

export function createMandates(db: Db, research: Research) {
  return {
    async createMandate(input: {
      ownerId: string;
      role: Role;
      subjectId: string;
      constraints: Constraints;
    }): Promise<Mandate> {
      if (!input.ownerId) throw new Error("A mandate needs an owner.");
      if (!ROLES.includes(input.role)) throw new Error(`Unknown role "${input.role}".`);

      const subject = await research.entityRef(input.subjectId);

      return db.transaction(async (tx) => {
        await tx.query("insert into guests (id) values ($1) on conflict (id) do nothing", [input.ownerId]);

        const [row] = await tx.query<MandateRow>(
          `insert into mandates (id, owner_id, role, subject, constraints)
           values ($1, $2, $3, $4::jsonb, $5::jsonb)
           returning *`,
          [
            randomUUID(),
            input.ownerId,
            input.role,
            JSON.stringify(subject),
            JSON.stringify(cleanConstraints(input.constraints)),
          ],
        );

        return toMandate(row);
      });
    },

    getMandate(mandateId: string, ownerId: string): Promise<Mandate> {
      return ownedMandate(db, mandateId, ownerId);
    },

    async listMandates(ownerId: string): Promise<Mandate[]> {
      const rows = await db.query<MandateRow>(
        "select * from mandates where owner_id = $1 order by created_at desc, id",
        [ownerId],
      );

      return rows.map(toMandate);
    },

    /**
     * Binds the eve session to the mandate. The first session attached stays, so two tabs that
     * race end up in one conversation: use the session ID on the mandate that comes back.
     */
    async attachSession(mandateId: string, ownerId: string, sessionId: string): Promise<Mandate> {
      if (!sessionId) throw new Error("A session ID is required.");

      try {
        await db.query(
          `update mandates set session_id = $3, updated_at = now()
           where id = $1 and owner_id = $2 and session_id is null`,
          [mandateId, ownerId, sessionId],
        );
      } catch (error) {
        // The session already carries another mandate. Whose it is stays unsaid.
        if (isUniqueViolation(error)) throw notFound();

        throw error;
      }

      return ownedMandate(db, mandateId, ownerId);
    },

    async setStage(mandateId: string, ownerId: string, stage: MandateStage): Promise<Mandate> {
      if (!STAGES.includes(stage)) throw new Error(`Unknown stage "${stage}".`);

      const [row] = await db.query<MandateRow>(
        "update mandates set stage = $3, updated_at = now() where id = $1 and owner_id = $2 returning *",
        [mandateId, ownerId, stage],
      );

      if (!row) throw notFound();

      return toMandate(row);
    },

    /**
     * Stores the criteria and reranks from the store. Changed criteria raise the revision, which
     * is what marks every earlier packet as based on older criteria: its basedOnRevision is now
     * below the mandate's. The same criteria again is a retry and leaves the revision alone.
     */
    async setConstraints(mandateId: string, ownerId: string, constraints: Constraints): Promise<Book> {
      const next = cleanConstraints(constraints);

      const mandate = await db.transaction(async (tx) => {
        const current = await ownedMandate(tx, mandateId, ownerId, true);

        if (canonical(current.constraints) === canonical(next)) return current;

        const [row] = await tx.query<MandateRow>(
          `update mandates set constraints = $2::jsonb, revision = revision + 1, updated_at = now()
           where id = $1
           returning *`,
          [mandateId, JSON.stringify(next)],
        );

        return toMandate(row);
      });

      // Ranking runs after the commit: it writes through its own connection and may log work.
      await research.rank(mandate);

      return research.readBook(mandateId, ownerId);
    },
  };
}
