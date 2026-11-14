import { randomUUID } from "node:crypto";

import {
  type EntityRef,
  type EvidenceBundle,
  NotFoundError,
  type Packet,
  type PacketSections,
  type Trail,
  type ValidationResult,
  type WithheldClaim,
} from "../contract";
import type { Db } from "../db";
import { buildBundle } from "./bundle";
import { renderPacket } from "./export";
import { canonical, iso, ownedMandate, type Research } from "./mandates";
import { validateSections } from "./validate";
import { appendEvent, claimKey } from "./work";

/** Thrown when approval is asked for a version that a later one has replaced. */
export class SupersededError extends Error {}

/** What a version was checked against. Frozen with it, so an export never changes under an approval. */
export type FrozenEvidence = {
  facts: EvidenceBundle["supportedFacts"];
  coverageNote: string;
};

type PacketRow = {
  id: string;
  mandate_id: string;
  version: number;
  candidate: EntityRef;
  based_on_revision: number;
  status: Packet["status"];
  sections: PacketSections;
  trails: Trail[];
  withheld: WithheldClaim[];
  evidence: FrozenEvidence;
  approved_at: Date | string | null;
  created_at: Date | string;
};

function toPacket(row: PacketRow): Packet {
  return {
    id: row.id,
    mandateId: row.mandate_id,
    version: row.version,
    candidate: row.candidate,
    basedOnRevision: row.based_on_revision,
    status: row.status,
    sections: row.sections,
    trails: row.trails,
    withheld: row.withheld,
    approvedAt: row.approved_at ? iso(row.approved_at) : null,
    createdAt: iso(row.created_at),
  };
}

async function findPacket(db: Db, mandateId: string, version: number): Promise<PacketRow> {
  // A version that is not a whole number cannot exist; say so before Postgres rejects the type.
  const [row] = Number.isSafeInteger(version)
    ? await db.query<PacketRow>("select * from packets where mandate_id = $1 and version = $2", [mandateId, version])
    : [];

  if (!row) throw new NotFoundError("Packet not found.");

  return row;
}

/** Keeps well-formed claims, once each. */
function cleanWithheld(claims: WithheldClaim[]): WithheldClaim[] {
  const seen = new Set<string>();
  const kept: WithheldClaim[] = [];

  for (const claim of claims ?? []) {
    if (typeof claim?.sentence !== "string" || !claim.sentence.trim()) continue;

    const by = claim.by === "second_read" ? "second_read" : "validation";
    const key = `${by}|${claimKey(claim)}`;

    if (seen.has(key)) continue;

    seen.add(key);
    kept.push({ sentence: claim.sentence.trim(), reason: String(claim.reason ?? "").trim(), by });
  }

  return kept;
}

export function createPackets(db: Db, research: Research) {
  async function getEvidenceBundle(mandateId: string, ownerId: string, candidateId: string): Promise<EvidenceBundle> {
    const mandate = await ownedMandate(db, mandateId, ownerId);
    const brief = await research.getBrief(mandateId, ownerId, candidateId);

    return buildBundle(mandate, brief);
  }

  return {
    getEvidenceBundle,

    async validatePacket(bundle: EvidenceBundle, sections: PacketSections): Promise<ValidationResult> {
      return validateSections(bundle, sections);
    },

    /**
     * Saves the next version and supersedes the earlier ones. The sections are checked again
     * here, so no version is stored with a sentence the checks withhold, whoever the caller is.
     * Saving what the latest version already holds is a retry and returns that version.
     */
    async savePacket(input: {
      mandateId: string;
      ownerId: string;
      candidateId: string;
      sections: PacketSections;
      withheld: WithheldClaim[];
    }): Promise<Packet> {
      const bundle = await getEvidenceBundle(input.mandateId, input.ownerId, input.candidateId);
      const { brief } = bundle;
      const checked = validateSections(bundle, input.sections);
      const withheld = cleanWithheld([...(input.withheld ?? []), ...checked.withheld]);
      const evidence: FrozenEvidence = { facts: bundle.supportedFacts, coverageNote: brief.coverageNote };

      return db.transaction(async (tx) => {
        await ownedMandate(tx, input.mandateId, input.ownerId, true);

        const earlier = await tx.query<PacketRow>(
          "select * from packets where mandate_id = $1 order by version desc",
          [input.mandateId],
        );

        const latest = earlier.at(0);

        if (
          latest &&
          latest.candidate.id === brief.candidate.id &&
          latest.based_on_revision === brief.revision &&
          canonical(latest.sections) === canonical(checked.sections) &&
          canonical(latest.withheld) === canonical(withheld)
        ) {
          return toPacket(latest);
        }

        const version = (latest?.version ?? 0) + 1;

        await tx.query("update packets set status = 'superseded' where mandate_id = $1 and status <> 'superseded'", [
          input.mandateId,
        ]);

        const [row] = await tx.query<PacketRow>(
          `insert into packets
             (id, mandate_id, version, candidate, based_on_revision, sections, trails, withheld, evidence)
           values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)
           returning *`,
          [
            randomUUID(),
            input.mandateId,
            version,
            JSON.stringify(brief.candidate),
            brief.revision,
            JSON.stringify(checked.sections),
            JSON.stringify(brief.trails),
            JSON.stringify(withheld),
            JSON.stringify(evidence),
          ],
        );

        // The log says what was withheld here for the first time. The statement of work counts
        // these claims from the packets, so the lines carry the version and are not counted again.
        const known = new Set(earlier.flatMap((packet) => packet.withheld.map(claimKey)));
        const fresh = withheld.filter((claim) => !known.has(claimKey(claim)));

        for (const [by, label] of [
          ["validation", "Validation"],
          ["second_read", "Second read"],
        ] as const) {
          const count = fresh.filter((claim) => claim.by === by).length;

          if (count === 0) continue;

          await appendEvent(
            tx,
            input.mandateId,
            {
              kind: "withheld",
              message: `${label}: ${count} ${count === 1 ? "claim" : "claims"} withheld (packet v${version})`,
              seconds: null,
              entity: brief.candidate,
              fromStore: false,
            },
            version,
          );
        }

        return toPacket(row);
      });
    },

    /**
     * Approves exactly this version. Approving it again changes nothing, and a version that a
     * later one has replaced can no longer be approved.
     */
    async approvePacket(mandateId: string, ownerId: string, version: number): Promise<Packet> {
      return db.transaction(async (tx) => {
        await ownedMandate(tx, mandateId, ownerId, true);

        const packet = await findPacket(tx, mandateId, version);

        if (packet.status === "approved") return toPacket(packet);

        if (packet.status === "superseded") {
          throw new SupersededError(`Packet version ${version} was replaced by a later version. Approve that one.`);
        }

        const [row] = await tx.query<PacketRow>(
          "update packets set status = 'approved', approved_at = now() where id = $1 returning *",
          [packet.id],
        );

        return toPacket(row);
      });
    },

    async getPacket(mandateId: string, ownerId: string, version: number): Promise<Packet> {
      await ownedMandate(db, mandateId, ownerId);

      return toPacket(await findPacket(db, mandateId, version));
    },

    /** Every version, newest first. */
    async listPackets(mandateId: string, ownerId: string): Promise<Packet[]> {
      await ownedMandate(db, mandateId, ownerId);

      const rows = await db.query<PacketRow>("select * from packets where mandate_id = $1 order by version desc", [
        mandateId,
      ]);

      return rows.map(toPacket);
    },

    async exportPacket(mandateId: string, ownerId: string, version: number): Promise<string> {
      const mandate = await ownedMandate(db, mandateId, ownerId);
      const row = await findPacket(db, mandateId, version);

      return renderPacket(mandate, toPacket(row), row.evidence);
    },
  };
}
