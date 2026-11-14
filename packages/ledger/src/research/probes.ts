import type {
  AgreementExtractor,
  AgreementType,
  EntityRef,
  ExtractedAgreement,
  ProbeAnswer,
  SourceRef,
} from "../contract";
import type { Db } from "../db";
import { markChanged } from "./ingest";
import { hashId, iso, json, mentions, nameKey } from "./sql";

const agreementTypes = new Set<AgreementType>([
  "government_contract",
  "public_funding",
  "partnership",
  "customer_agreement",
  "mou",
  "other",
]);

type StoredPassage = { id: string; text: string; title: string | null; source: SourceRef };

type ClaimRow = { id: string; claim_index: number; text: string; passages: StoredPassage[] };

type ProbeRow = {
  response_id: string;
  subject_id: string | null;
  question: string;
  asked_at: unknown;
  entities: ProbeAnswer["entities"];
  extracted_at: unknown;
};

export type AgreementVerdict =
  | { edge: true; fromId: string; toId: string }
  | { edge: false; reason: string };

/**
 * Decides whether one extracted agreement may become an edge (consensus point 16.2). The model
 * proposed the fields; nothing it says is taken on trust here. Both legal parties must resolve
 * to Cala IDs through the answer's own entities, the probed entity's ID stands in only for the
 * probed entity itself, and the cited passages must name both parties.
 */
export function judgeAgreement(
  agreement: ExtractedAgreement,
  answer: ProbeAnswer,
  subjectNames: string[],
): AgreementVerdict {
  const claim = answer.claims.find((one) => one.index === agreement.claimIndex);

  if (!claim) return { edge: false, reason: "The reading points at a claim that is not in the answer." };
  if (!agreementTypes.has(agreement.type)) return { edge: false, reason: "The agreement type is not one we hold." };

  if (!claim.passages.some((passage) => passage.source.url)) {
    return { edge: false, reason: "The claim cites no passage with a document URL." };
  }

  const cited = claim.passages.map((passage) => passage.text).join(" \n ");
  const resolved: string[] = [];

  for (const [name, id] of [
    [agreement.partyA, agreement.partyAId],
    [agreement.partyB, agreement.partyBId],
  ] as const) {
    if (!id) return { edge: false, reason: `${name} has no Cala ID in this answer, so the party stays unresolved.` };

    let names: string[];

    if (id === answer.subject.id) {
      if (!agreement.aboutSubjectItself) {
        return {
          edge: false,
          reason: `The claim concerns a subsidiary, parent or joint venture; ${answer.subject.name}'s ID cannot stand in for it.`,
        };
      }

      names = subjectNames;
    } else {
      const entity = answer.entities.find((one) => one.id === id);

      if (!entity) return { edge: false, reason: `The ID given for ${name} is not among the entities Cala resolved.` };

      names = [entity.name, ...entity.mentions];

      // The name Cala matched must be in the claim itself, and must not fit a second entity.
      if (!names.some((one) => mentions(claim.text, one))) {
        return { edge: false, reason: `The claim does not name ${entity.name}.` };
      }

      const rivals = answer.entities.filter(
        (one) => one.id !== id && [one.name, ...one.mentions].some((other) => nameKey(other) === nameKey(name)),
      );

      if (rivals.length > 0) return { edge: false, reason: `${name} matches more than one entity in the answer.` };
    }

    // The ID must be the party the reading names, not a relative of it. Kuva US Inc. is not Kuva Space.
    if (!names.some((one) => nameKey(one) === nameKey(name))) {
      return { edge: false, reason: `${name} is not the entity the ID belongs to; the party stays unresolved.` };
    }

    if (!names.some((one) => mentions(cited, one))) {
      return { edge: false, reason: `The cited passages do not name ${name}.` };
    }

    resolved.push(id);
  }

  if (resolved[0] === resolved[1]) return { edge: false, reason: "Both parties resolve to the same entity." };

  return { edge: true, fromId: resolved[0]!, toId: resolved[1]! };
}

/** The stored answer of one probe, in the shape the extractor reads. */
export async function probeAnswer(db: Db, responseId: string): Promise<ProbeAnswer | null> {
  const [probe] = await db.query<ProbeRow>("select * from probes where response_id = $1", [responseId]);

  if (!probe?.subject_id) return null;

  const [subject] = await db.query<{ id: string; name: string; entity_type: string; description: string | null }>(
    "select id, name, entity_type, description from entities where id = $1",
    [probe.subject_id],
  );

  if (!subject) return null;

  const claims = await db.query<ClaimRow>(
    "select id, claim_index, text, passages from probe_claims where response_id = $1 order by claim_index",
    [responseId],
  );

  return {
    subject: { id: subject.id, name: subject.name, entityType: subject.entity_type, description: subject.description },
    question: probe.question,
    claims: claims.map((claim) => ({
      index: claim.claim_index,
      text: claim.text,
      passages: claim.passages.map((passage) => ({ text: passage.text, source: passage.source })),
    })),
    entities: probe.entities.map((entity) => ({ ...entity, mentions: entity.mentions ?? [] })),
  };
}

/** Every name the probed entity is known by: its own, its legal name, its aliases and Cala's mentions. */
async function subjectNames(db: Db, answer: ProbeAnswer): Promise<string[]> {
  const [row] = await db.query<{ properties: Record<string, { value: unknown }> | null }>(
    "select properties from entities where id = $1",
    [answer.subject.id],
  );
  const names = [answer.subject.name];
  const legal = row?.properties?.legal_name?.value;
  const aliases = row?.properties?.aliases?.value;

  if (typeof legal === "string") names.push(legal);
  if (Array.isArray(aliases)) names.push(...aliases.filter((alias): alias is string => typeof alias === "string"));

  for (const entity of answer.entities) {
    if (entity.id === answer.subject.id) names.push(entity.name, ...entity.mentions);
  }

  return names;
}

/**
 * Reads agreements out of a stored probe once: one extractor call, its output kept with the
 * claims, and an agreement edge for each reading the checks let through. Returns false when the
 * probe has no known subject yet. Throws what the extractor throws, leaving the probe unread.
 */
export async function readAgreements(db: Db, responseId: string, extract: AgreementExtractor): Promise<boolean> {
  const [probe] = await db.query<ProbeRow>("select * from probes where response_id = $1", [responseId]);

  if (!probe) return false;
  if (probe.extracted_at) return true;

  const answer = await probeAnswer(db, responseId);

  if (!answer) return false;

  const agreements = await extract(answer);
  const names = await subjectNames(db, answer);
  const askedAt = iso(probe.asked_at)!;

  await db.transaction(async (tx) => {
    await tx.query("delete from edges where response_id = $1 and origin = 'derived'", [responseId]);
    await tx.query(
      "update probe_claims set extraction = null, status = 'reported', reason = null where response_id = $1",
      [responseId],
    );

    // One claim may hold several agreements; each reading is judged alone.
    const byClaim = new Map<number, ExtractedAgreement[]>();

    for (const agreement of agreements) {
      byClaim.set(agreement.claimIndex, [...(byClaim.get(agreement.claimIndex) ?? []), agreement]);
    }

    for (const [claimIndex, readings] of byClaim) {
      const verdicts = readings.map((reading) => judgeAgreement(reading, answer, names));
      const refused = verdicts.flatMap((verdict) => (verdict.edge ? [] : [verdict.reason]));

      await tx.query("update probe_claims set extraction = $2::jsonb, status = $3, reason = $4 where id = $1", [
        `${responseId}:${claimIndex}`,
        json(readings),
        verdicts.some((verdict) => verdict.edge) ? "edge" : "unresolved",
        refused.length > 0 ? refused.join(" ") : null,
      ]);
    }

    for (const agreement of agreements) {
      const claim = answer.claims.find((one) => one.index === agreement.claimIndex);
      const verdict = judgeAgreement(agreement, answer, names);
      const claimId = `${responseId}:${agreement.claimIndex}`;

      if (!verdict.edge || !claim) continue;

      await tx.query(
        `insert into edges
           (id, source_id, target_id, relationship, family, observed_on, observed_direction, properties, origin,
            claim, claim_id, sources, response_id, fetched_at)
         values ($1, $2, $3, $4, 'agreement', $5, 'outgoing', $6::jsonb, 'derived', $7, $8, $9::jsonb, $10, $11)
         on conflict (id) do update set
           properties = excluded.properties, claim = excluded.claim, sources = excluded.sources`,
        [
          hashId("claim", claimId, verdict.fromId, verdict.toId, agreement.type),
          verdict.fromId,
          verdict.toId,
          agreement.type,
          answer.subject.id,
          json({
            date: agreement.date,
            date_precision: agreement.datePrecision,
            status: agreement.status,
            value: agreement.value,
            units: agreement.units,
            value_is_programme_ceiling: agreement.valueIsProgrammeCeiling,
          }),
          claim.text,
          claimId,
          json(claim.passages.map((passage) => passage.source)),
          responseId,
          askedAt,
        ],
      );
    }

    await tx.query(
      "update probes set agreements_found = $2, extracted_at = clock_timestamp() where response_id = $1",
      [responseId, agreements.length],
    );
    await markChanged(tx);
  });

  return true;
}

const typeLabels: Record<AgreementType, string> = {
  government_contract: "Government contract",
  public_funding: "Public funding agreement",
  partnership: "Partnership",
  customer_agreement: "Customer agreement",
  mou: "Memorandum of understanding",
  other: "Agreement",
};

export function agreementLabel(type: string, other: EntityRef | string, status: string | null): string {
  const name = typeof other === "string" ? other : other.name;
  const label = typeLabels[type as AgreementType] ?? "Agreement";

  return `${label} with ${name}${status === "intended" ? " (intended, not executed)" : ""}`;
}
