import { expect, test } from "vitest";
import { memoryDb } from "../db";
import { computeTrails, isSourcedTrail, storedTrails } from "../../src/research/trails";

test("bounded ownership joins keep the owner's public-money signal and require every link", async () => {
  const db = await memoryDb();
  const source = JSON.stringify([{ name: "Register", url: "https://example.org/record", date: null, rank: "FILING" }]);
  try {
    for (const id of ["subject", "backer", "owner", "end", "portfolio"]) {
      await db.query(`insert into entities (id, name, entity_type, name_key, first_seen_in, first_seen_at)
        values ($1, $1, 'Company', $1, 'fixture', now())`, [id]);
    }
    for (const [from, to, family, relationship, direction] of [
      ["subject", "backer", "investment", "INVESTED_IN", "to_funds_from"],
      ["backer", "owner", "ownership", "IS_SUBSIDIARY_OF", "not_applicable"],
      ["owner", "end", "investment", "INVESTED_IN", "from_funds_to"],
      ["owner", "end", "agreement", "partnership", "not_applicable"],
      ["end", "portfolio", "investment", "INVESTED_IN", "from_funds_to"],
    ]) {
      const id = `${from}-${to}-${family}`;
      await db.query(`insert into edges (id, source_id, target_id, relationship, family, observed_on,
        observed_direction, response_id, fetched_at, sources) values ($1, $2, $3, $4, $5, $2, 'outgoing', 'fixture', now(), $6)`,
        [id, from, to, relationship, family, source]);
      await db.query(`insert into ties (from_id, to_id, family, relationship, direction, origin, key, edge_ids)
        values ($1, $2, $3, $4, $5, 'native', $6, $7)`, [from, to, family, relationship, direction, id, JSON.stringify([id])]);
    }
    await db.query(`insert into signals (id, type, entity_id, label, origin, sources)
      values ('grant', 'public_money', 'owner', 'Public grant', 'native', $1)`, [source]);
    const subject = { id: "subject", name: "subject", entityType: "Company", description: null };
    const trails = (await computeTrails(db, subject, "founder", new Date())).filter((trail) => trail.hops.length === 3 && trail.pattern === "T4");
    expect(trails).toHaveLength(2);
    expect(trails.every(isSourcedTrail)).toBe(true);
    const agreement = trails.find((trail) => trail.hops[2]!.family === "agreement")!;
    expect(agreement.signal?.entity.id).toBe("owner");
    expect(agreement.hops[1]!.relationship).toBe("IS_SUBSIDIARY_OF");
    await db.query("update edges set sources = '[]' where family = 'ownership'");
    await computeTrails(db, subject, "founder", new Date());
    expect((await storedTrails(db, subject, "founder")).filter((trail) => trail.hops.length === 3 && trail.pattern === "T4")).toEqual([]);
  } finally { await db.close(); }
});
