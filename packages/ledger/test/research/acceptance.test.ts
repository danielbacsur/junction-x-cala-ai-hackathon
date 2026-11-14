import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { requestId } from "../../src/cala/id";
import type { ExtractedAgreement, Trail } from "../../src/contract";
import { confirmIdentity } from "../../src/research";
import { describeHop, describeSignal } from "../../src/research/book";
import { judgeAgreement, probeAnswer } from "../../src/research/probes";
import { narrowStarBody, roundBody } from "../../src/research/requests";
import { ids, NOW, type World, world } from "./helpers";

/**
 * The acceptance fixtures of consensus point 16.9, from the saved responses alone: the Cala in
 * these tests is latched off and answers only what the store holds. Fixture 5 (the second read
 * withholding an overclaim) belongs to the agent and is not here.
 */

let w: World;

beforeAll(async () => {
  w = await world();
}, 120_000);

afterAll(() => w.db.close());

const chain = (trail: Trail) => [trail.subject.name, ...trail.hops.map((hop) => hop.to.name)].join(" > ");

/** A star read that never happened, for the cases the saved evidence has no example of. */
function star(id: string, name: string, relationships: Record<"outgoing" | "incoming", Record<string, unknown[]>>, type = "Company") {
  const request = { kind: "entity", entityId: id, body: narrowStarBody } as const;

  return {
    id: requestId(request),
    request,
    status: 200,
    fetchedAt: NOW.toISOString(),
    seconds: 0.1,
    body: { id, name, entity_type: type, description: null, properties: {}, relationships },
    fromStore: false,
    provenance: { fixture: "test", note: "Synthetic: written for one test, never returned by Cala." },
  };
}

const item = (id: string, name: string, type: string, properties: Record<string, unknown> = {}) => ({
  id,
  name,
  entity_type: type,
  properties: { sources: [{ name: "example.test", document: `https://example.test/${id}`, date: "2026-06-01" }], ...properties },
});

describe("1. the Redpine – Luminar – Photoncycle grant trail", () => {
  test("is found with two shared backers, two grants and a source on every hop", async () => {
    const mandate = await w.mandates.create("founder", ids.redpine, { includePublicFunding: true });
    const result = await w.research.workMandate(mandate.id, mandate.ownerId);

    // Nothing was fetched: the store answered every read.
    expect(result.requestsUsed).toBe(0);

    const trails = [
      ...(await w.research.getTrails(mandate.id, mandate.ownerId, ids.luminar)),
      ...(await w.research.getTrails(mandate.id, mandate.ownerId, ids.nordicNinja)),
    ].filter((trail) => trail.pattern === "T2" && trail.end.id === ids.photoncycle);

    expect(new Set(trails.map(chain))).toEqual(
      new Set([
        "Redpine Technology AB > Luminar Ventures > Photoncycle",
        "Redpine Technology AB > NORDICNINJA VC LIMITED > Photoncycle",
      ]),
    );

    // Two grants, each attached to both paths.
    expect(new Set(trails.map((trail) => trail.signal!.label))).toEqual(
      new Set(["Grant from ENOVA SF", "Grant from Innovation Norway"]),
    );
    expect(trails).toHaveLength(4);

    for (const trail of trails) {
      expect(trail.hopCount).toBe(2);
      expect(trail.independentTrails).toBe(2);
      expect(trail.hops.every((hop) => hop.sources.length > 0 && hop.origin === "native")).toBe(true);
      expect(trail.signal!.type).toBe("public_money");
      expect(trail.signal!.sources.some((source) => source.name === "stotte.brreg.no" && source.url)).toBe(true);
      expect(trail.signal!.publicBasis).toMatchObject({ ours: true });
    }

    const enova = trails.find((trail) => trail.signal!.label === "Grant from ENOVA SF" && trail.hops[0]!.to.id === ids.luminar)!;

    expect(enova.signal).toMatchObject({
      value: 14376817,
      units: "NOK",
      date: "2025-03-13",
      dateKind: "event_date",
      instrument: "GRANT",
      flag: null,
    });
    expect(enova.signal!.parties.map((party) => `${party.entity.name}:${party.role}`).sort()).toEqual([
      "ENOVA SF:GRANTOR",
      "Photoncycle:ISSUER",
    ]);

    // Roles in the same round settle Luminar's two hops; NordicNinja's have no role evidence.
    expect(enova.hops.map((hop) => hop.direction)).toEqual(["to_funds_from", "from_funds_to"]);
    expect(enova.readInFull).toEqual([ids.redpine, ids.luminar, ids.photoncycle]);

    const ninja = trails.find((trail) => trail.hops[0]!.to.id === ids.nordicNinja)!;

    expect(ninja.hops.map((hop) => hop.direction)).toEqual(["undirected", "undirected"]);
    expect(ninja.seenInListOnly).toEqual([ids.nordicNinja]);
  });
});

describe("2. ICEYE – IHI Corporation – Kuva Space", () => {
  test("is a T6 trail from the two probe fixtures", async () => {
    const mandate = await w.mandates.create("founder", ids.iceye);

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const [trail] = await w.research.getTrails(mandate.id, mandate.ownerId, ids.kuva);

    expect(trail).toMatchObject({ pattern: "T6", hopCount: 2 });
    expect(chain(trail!)).toBe("ICEYE > IHI Corporation > Kuva Space");

    for (const hop of trail!.hops) {
      expect(hop).toMatchObject({ family: "agreement", origin: "derived", direction: "not_applicable" });
      expect(hop.claim).toBeTruthy();
      expect(hop.sources.length).toBeGreaterThan(0);
      expect(hop.sources.every((source) => source.url)).toBe(true);
    }

    expect(trail!.hops[1]!.relationship).toBe("mou");
    expect(trail!.hops[1]!.claim).toContain("memorandum of understanding with Japan’s IHI Corporation");
    expect(trail!.signal).toMatchObject({ type: "agreement", origin: "derived", value: null });
    expect(trail!.signal!.entity.id).toBe(ids.kuva);
  });

  test("reaches an investor's Book only through a fund's own tie, with the full hop count", async () => {
    const mandate = await w.mandates.create("investor", ids.eib);

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const book = await w.research.readBook(mandate.id, mandate.ownerId);
    const row = book.rows.find((one) => one.candidate.id === ids.kuva)!;

    expect(row).toMatchObject({ category: "lead", directFitOnly: false });
    expect(row.bestTrail).toMatchObject({ pattern: "T6", hopCount: 3 });

    const [trail] = await w.research.getTrails(mandate.id, mandate.ownerId, ids.kuva);

    expect(chain(trail!)).toBe("European Investment Bank > ICEYE > IHI Corporation > Kuva Space");
    expect(trail!.hops[0]).toMatchObject({ family: "investment", direction: "undirected" });
  });
});

describe("3. direction of investment ties", () => {
  test("Kfund's incoming portfolio companies are not presented as Kfund's backers", async () => {
    // Every tie where the other side is said to fund Kfund rests on roles in a round, never on a list.
    const ties = await w.db.query<{ to_id: string; direction: string; direction_basis: unknown[]; stated: string }>(
      "select to_id, direction, direction_basis, stated from ties where from_id = $1 and family = 'investment'",
      [ids.kfund],
    );
    const incoming = ties.filter((tie) => tie.stated === "to_from" || tie.stated === "both");

    expect(incoming.length).toBeGreaterThan(10);
    expect(ties.filter((tie) => tie.direction === "to_funds_from").every((tie) => tie.direction_basis.length > 0)).toBe(true);
    expect(incoming.filter((tie) => tie.direction_basis.length === 0).every((tie) => tie.direction === "undirected")).toBe(true);

    // Kfund's tie to Cala AI is settled by roles in one round, and worded accordingly.
    expect(ties.find((tie) => tie.to_id === ids.calaAi)).toMatchObject({ direction: "from_funds_to" });

    const mandate = await w.mandates.create("investor", ids.kfund);

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const book = await w.research.readBook(mandate.id, mandate.ownerId);
    const lead = book.rows.find((row) => row.category === "lead")!;
    const trails = await w.research.getTrails(mandate.id, mandate.ownerId, lead.candidate.id);

    expect(trails.length).toBeGreaterThan(0);

    for (const hop of trails.flatMap((trail) => trail.hops)) {
      const wording = describeHop(hop);

      if (hop.direction === "undirected") expect(wording).toContain("have an investment tie (direction not settled)");
      else expect(hop.role).toBeTruthy();
    }
  });

  test("10. degree cannot direct a tie, and co-investors are not tied to each other", async () => {
    // Kibo has more than a hundred ties. Without roles, each stays undirected.
    const kibo = await w.db.query<{ direction: string; direction_basis: unknown[] }>(
      `select direction, direction_basis from ties
       where family = 'investment' and from_id = (select id from entities where name = 'Kibo Ventures')`,
    );

    expect(kibo.length).toBeGreaterThan(100);
    expect(kibo.filter((tie) => tie.direction_basis.length === 0).every((tie) => tie.direction === "undirected")).toBe(true);
    expect(kibo.some((tie) => tie.direction === "undirected")).toBe(true);

    // Northzone and Mubadala are both investors in Flink's Series B. Each is tied to Flink, by
    // roles; nothing ties them to each other.
    const flink = await w.db.query<{ from_name: string; to_name: string; direction: string }>(
      `select f.name as from_name, t.name as to_name, ties.direction
       from ties join entities f on f.id = ties.from_id join entities t on t.id = ties.to_id
       where ties.family = 'investment' and f.name in ('Northzone', 'Mubadala Capital')
         and t.name in ('Northzone', 'Mubadala Capital', 'Flink')
       order by f.name`,
    );

    expect(flink).toEqual([
      { from_name: "Mubadala Capital", to_name: "Flink", direction: "from_funds_to" },
      { from_name: "Northzone", to_name: "Flink", direction: "from_funds_to" },
    ]);
  });
});

describe("4. identity", () => {
  test("the two Business Finland IDs stay separate", async () => {
    const dossier = await w.research.getDossier(ids.businessFinland);

    expect(dossier.possibleDuplicates).toEqual([
      expect.objectContaining({
        entity: expect.objectContaining({ id: ids.businessFinlandOy }),
        basis: "Same normalized name; a proposal, not a join.",
      }),
    ]);

    // Both are public funders in their own right, under one label, as two rows.
    const registry = await w.db.query<{ entity_id: string; label: string }>(
      "select entity_id, label from public_funders where label = 'Business Finland' order by entity_id",
    );

    expect(registry.map((row) => row.entity_id).sort()).toEqual([ids.businessFinlandOy, ids.businessFinland].sort());

    // No tie joins the two, and neither one's portfolio became the other's.
    const [crossed] = await w.db.query<{ n: number }>(
      `select count(*)::integer as n from ties a
       where a.from_id = $1 and (a.to_id = $2 or exists (
         select 1 from ties b where b.from_id = $2 and b.to_id = a.to_id
           and not exists (select 1 from edges where edges.observed_on = $1 and (edges.target_id = a.to_id or edges.source_id = a.to_id))
       ))`,
      [ids.businessFinland, ids.businessFinlandOy],
    );

    expect(crossed!.n).toBe(0);
  });

  test("a shared name and a shared domain propose a group and cannot create a path", async () => {
    const domain = item("dom-twin", "twinlabs.test", "DomainName");

    // Twin Labs Oy is backed by Fund One; Twin Labs by Fund Two, which also backs Far Company.
    await w.research.ingest(
      star("twin-a", "Twin Labs Oy", { outgoing: { HAS_DOMAIN_NAME: [domain] }, incoming: { INVESTED_IN: [item("fund-1", "Fund One", "Company")] } }),
    );
    await w.research.ingest(
      star("twin-b", "Twin Labs", { outgoing: { HAS_DOMAIN_NAME: [domain] }, incoming: { INVESTED_IN: [item("fund-2", "Fund Two", "Company")] } }),
    );
    await w.research.ingest(
      star("fund-2", "Fund Two", {
        outgoing: { INVESTED_IN: [item("twin-b", "Twin Labs", "Company"), item("far-co", "Far Company", "Company")] },
        incoming: {},
      }),
    );
    await w.research.ingest(
      star("fund-1", "Fund One", { outgoing: { INVESTED_IN: [item("twin-a", "Twin Labs Oy", "Company")] }, incoming: {} }),
    );

    const proposals = (await w.research.getDossier("twin-a")).possibleDuplicates;

    expect(proposals.map((proposal) => [proposal.entity.id, proposal.basis]).sort()).toEqual([
      ["twin-b", "Same normalized name; a proposal, not a join."],
      ["twin-b", "Shares a domain; a proposal, not a join."],
    ]);

    const mandate = await w.mandates.create("founder", "twin-a");

    await w.research.workMandate(mandate.id, mandate.ownerId);

    // Far Company is two hops from Twin Labs and unreachable from Twin Labs Oy.
    expect(await w.research.getTrails(mandate.id, mandate.ownerId, "far-co")).toEqual([]);
    expect((await w.research.readBook(mandate.id, mandate.ownerId)).rows).toEqual([]);

    const other = await w.mandates.create("founder", "twin-b");

    await w.research.workMandate(other.id, other.ownerId);
    expect((await w.research.getTrails(other.id, other.ownerId, "far-co")).map(chain)).toEqual(["Twin Labs > Fund Two > Far Company"]);

    // A recorded equivalence keeps both IDs, with who decided and on what basis.
    await confirmIdentity(w.db, {
      entityIds: ["twin-a", "twin-b"],
      basis: "legal_identifier",
      evidence: "Both carry business ID 1234567-8 in the trade register (test).",
      reviewer: "test",
    });

    const confirmed = (await w.research.getDossier("twin-a")).possibleDuplicates.find((one) => one.basis.startsWith("Recorded"));

    expect(confirmed).toMatchObject({ entity: { id: "twin-b" } });
    expect(confirmed!.basis).toContain("both IDs are kept");
    expect(await w.db.query("select id from entities where id in ('twin-a', 'twin-b') order by id")).toEqual([
      { id: "twin-a" },
      { id: "twin-b" },
    ]);
  });
});

describe("6 and 7. what a probe and a record do not show", () => {
  test("Redpine's empty probe is stored as none found, and its Vinnova grant still appears", async () => {
    const dossier = await w.research.getDossier(ids.redpine);

    expect(dossier.unresolvedClaims[0]!.claim).toMatch(/^None found by Cala on 2026-11-14, in answer to: Which government contracts/);
    // What Cala wrote is kept beside it, with the passages it read.
    expect(dossier.unresolvedClaims[1]!.claim).toContain("contain no information about any government contracts");
    expect(dossier.unresolvedClaims[1]!.sources.length).toBeGreaterThan(0);

    const grant = dossier.signals.find((signal) => signal.label === "Grant from VINNOVA")!;

    expect(grant).toMatchObject({ type: "public_money", value: 40000, units: "SEK", instrument: "GRANT", origin: "native" });
    // The round has no date of its own, so only the source's date is known, and it says so.
    expect(grant).toMatchObject({ date: "2026-11-12", dateKind: "reported_on" });
    expect(describeSignal(grant)).toContain("reported on 2026-11-12");
    expect(grant.sources[0]).toMatchObject({ name: "vinnova.se", rank: "PRIMARY" });
  });

  test("the Innovation Norway record with disagreeing dates is flagged, not counted as one dated award", async () => {
    const signals = (await w.research.getDossier(ids.photoncycle)).signals;
    const flagged = signals.find((signal) => signal.label === "Grant from Innovation Norway")!;
    const clean = signals.find((signal) => signal.label === "Grant from ENOVA SF")!;

    expect(flagged.flag).toContain("Cites 2 separate register entries (dated 2025-09-22 and 2025-12-11)");
    expect(flagged.flag).toContain("not counted as one dated award");
    expect(describeSignal(flagged)).toContain("dates disagree (the record says 2023-01-27)");
    expect(clean.flag).toBeNull();

    // On the Book the dated ENOVA award ranks the row; the flagged record is shown as a hesitation.
    const mandate = await w.mandates.create("founder", ids.redpine, { includePublicFunding: true });

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const book = await w.research.readBook(mandate.id, mandate.ownerId);
    const rank = (id: string) => book.rows.find((row) => row.candidate.id === id)!.rank;

    expect(rank(ids.enova)).toBeLessThan(rank(ids.innovationNorway));
    expect(book.rows.find((row) => row.candidate.id === ids.luminar)!.bestTrail!.signalLabel).toBe("Grant from ENOVA SF");

    const brief = await w.research.getBrief(mandate.id, mandate.ownerId, ids.innovationNorway);

    expect(brief.whyHesitate.find((line) => line.criterion === "Dates disagree")!.statement).toContain("not counted as one dated award");
  });
});

describe("8. what is not public money, and what is not control", () => {
  test("a private grantor or lender is a financing with its instrument, and waits for review", async () => {
    const round = (id: string, instrument: string, role: string, funder: ReturnType<typeof item>) => {
      const request = { kind: "entity", entityId: id, body: roundBody } as const;
      const sources = [{ name: "example.test", document: `https://example.test/${id}`, date: "2026-05-02", source_rank: "PRIMARY" }];

      return {
        id: requestId(request),
        request,
        status: 200,
        fetchedAt: NOW.toISOString(),
        seconds: 0.1,
        body: {
          id,
          name: instrument === "GRANT" ? "Grant" : "Debt",
          entity_type: "FundingRound",
          properties: {
            instrument: { value: instrument, sources },
            event_date: { value: "2026-05-01", sources },
            transaction_value: { value: 250000, sources },
            transaction_value_units: { value: "EUR", sources },
          },
          relationships: {
            outgoing: {},
            incoming: {
              PARTICIPATES_IN_FUNDING_ROUND: [
                item("private-co", "Private Company", "Company", { role: role === "GRANTOR" ? "ISSUER" : "BORROWER" }),
                { ...funder, properties: { ...funder.properties, role } },
              ],
            },
          },
        },
        fromStore: false,
        provenance: { fixture: "test", note: "Synthetic: written for one test, never returned by Cala." },
      };
    };

    await w.research.ingest(round("round-private-grant", "GRANT", "GRANTOR", item("foundation", "Wealthy Family Foundation", "Organization")));
    await w.research.ingest(round("round-private-loan", "DEBT", "LENDER", item("bank", "Merchant Bank Ltd", "Company")));
    await w.research.ingest(star("private-co", "Private Company", { outgoing: {}, incoming: {} }));

    const signals = (await w.research.getDossier("private-co")).signals;

    expect(signals.map((signal) => [signal.type, signal.label, signal.instrument, signal.publicBasis]).sort()).toEqual([
      ["financing", "Grant from Wealthy Family Foundation", "GRANT", null],
      ["financing", "Loan from Merchant Bank Ltd", "DEBT", null],
    ]);

    expect(await w.db.query("select entity_id, status from public_funder_review where entity_id in ('foundation', 'bank') order by entity_id")).toEqual([
      { entity_id: "bank", status: "pending" },
      { entity_id: "foundation", status: "pending" },
    ]);
    expect(await w.db.query("select 1 from public_funders where entity_id in ('foundation', 'bank')")).toEqual([]);
  });

  test("a board appointment is not called a change of control", async () => {
    // Marek Kiisa joined Redpine's board on 2026-04-01, inside the window.
    const [seat] = await w.db.query<{ valid_since: string; family: string }>(
      `select valid_since, family from edges
       where target_id = $1 and relationship = 'IS_BOARD_MEMBER_OF' and valid_since is not null`,
      [ids.redpine],
    );

    expect(seat).toEqual({ valid_since: "2026-04-01", family: "person" });

    const signals = (await w.research.getDossier(ids.redpine)).signals;

    expect(signals.some((signal) => signal.type === "control_change")).toBe(false);
    expect(signals.some((signal) => /control/i.test(signal.label))).toBe(false);
  });
});

describe("9. the Kuva US claim", () => {
  test("did not become a Kuva Space agreement, and stays in the dossier with its ceiling", async () => {
    expect(
      await w.db.query("select 1 from ties where family = 'agreement' and from_id = $1 and to_id = $2", [ids.kuva, ids.nasa]),
    ).toEqual([]);

    const dossier = await w.research.getDossier(ids.kuva);

    expect(dossier.signals.some((signal) => signal.parties.some((party) => party.entity.id === ids.nasa))).toBe(false);
    expect(dossier.unresolvedClaims.some((claim) => claim.claim.includes("maximum ceiling of $476"))).toBe(true);

    const [claim] = await w.db.query<{ status: string; reason: string; extraction: ExtractedAgreement[] }>(
      "select status, reason, extraction from probe_claims where subject_id = $1 and claim_index = 0",
      [ids.kuva],
    );

    expect(claim).toMatchObject({ status: "unresolved", extraction: [{ valueIsProgrammeCeiling: true, partyAId: null }] });
    expect(claim!.reason).toContain("Kuva US Inc. has no Cala ID");

    // The Syke partnership has no Cala ID for its counterparty, so it stays unresolved as well.
    expect(
      await w.db.query("select status from probe_claims where subject_id = $1 and claim_index = 2", [ids.kuva]),
    ).toEqual([{ status: "unresolved" }]);
  });

  test("cannot borrow the probed entity's ID, whatever the reading says", async () => {
    const [probe] = await w.db.query<{ response_id: string }>("select response_id from probes where subject_id = $1", [ids.kuva]);
    const answer = (await probeAnswer(w.db, probe!.response_id))!;
    const reading: ExtractedAgreement = {
      claimIndex: 0,
      partyA: "Kuva US Inc.",
      partyB: "NASA",
      partyAId: ids.kuva,
      partyBId: ids.nasa,
      type: "government_contract",
      date: "2026-06-18",
      datePrecision: "day",
      status: "executed",
      value: 476000000,
      units: "USD",
      valueIsProgrammeCeiling: true,
      aboutSubjectItself: false,
    };

    // The reading says it is about the subsidiary: the subject's ID may not stand in.
    expect(judgeAgreement(reading, answer, ["Kuva Space"])).toMatchObject({ edge: false });
    // Even a reading that wrongly claims the subject itself fails on the name it gives.
    expect(judgeAgreement({ ...reading, aboutSubjectItself: true }, answer, ["Kuva Space"])).toEqual({
      edge: false,
      reason: "Kuva US Inc. is not the entity the ID belongs to; the party stays unresolved.",
    });
    // And renaming the party does not help while the reading says it is about a subsidiary.
    expect(judgeAgreement({ ...reading, partyA: "Kuva Space" }, answer, ["Kuva Space"])).toMatchObject({ edge: false });

    // The memorandum with IHI is about Kuva Space itself, names IHI, and passes.
    const memorandum: ExtractedAgreement = { ...reading, claimIndex: 4, partyA: "Kuva Space", partyB: "IHI Corporation", partyBId: ids.ihi, type: "mou", value: null, units: null, valueIsProgrammeCeiling: false, aboutSubjectItself: true };

    expect(judgeAgreement(memorandum, answer, ["Kuva Space"])).toEqual({ edge: true, fromId: ids.kuva, toId: ids.ihi });
    // An ID Cala did not resolve in this answer is not accepted from the reading.
    expect(judgeAgreement({ ...memorandum, partyBId: ids.eib }, answer, ["Kuva Space"])).toMatchObject({ edge: false });
  });
});

describe("11. rows without a connection, and existing backers", () => {
  test("a candidate with no demonstrated connection says direct fit only", async () => {
    const mandate = await w.mandates.create("investor", ids.luminar, { sectors: ["software"] });

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const book = await w.research.readBook(mandate.id, mandate.ownerId);

    expect(book.rows.length).toBeGreaterThan(0);

    for (const row of book.rows) {
      expect(row).toMatchObject({ category: "direct_fit", directFitOnly: true, trailIds: [], bestTrail: null });
      expect(row.reason).toContain("direct fit only");
      expect(row.fit.some((line) => line.criterion === "Sector" && line.sources.length > 0)).toBe(true);
    }

    // Luminar's own portfolio companies at Slush are named as such and never offered as new.
    expect(book.rows.some((row) => row.candidate.id === ids.redpine || row.candidate.id === ids.photoncycle)).toBe(false);
    expect(book.gaps.some((gap) => gap.includes("already tied to your fund") && gap.includes("Redpine Technology AB"))).toBe(true);
  });

  test("existing backers are follow-up targets and never new leads", async () => {
    const mandate = await w.mandates.create("founder", ids.redpine);

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const book = await w.research.readBook(mandate.id, mandate.ownerId);
    const backers = new Set(
      (
        await w.db.query<{ source_id: string }>(
          "select source_id from edges where target_id = $1 and relationship = 'INVESTED_IN'",
          [ids.redpine],
        )
      ).map((row) => row.source_id),
    );

    expect(book.rows.find((row) => row.candidate.id === ids.luminar)).toMatchObject({ category: "follow_up" });
    expect(book.rows.find((row) => row.candidate.id === ids.nordicNinja)).toMatchObject({ category: "follow_up" });
    expect(book.rows.filter((row) => row.category === "lead").length).toBeGreaterThan(0);
    expect(book.rows.filter((row) => row.category === "lead").some((row) => backers.has(row.candidate.id))).toBe(false);

    // Public funding was not chosen, so public funders are counted in a gap and not listed.
    expect(book.rows.some((row) => row.category === "non_dilutive")).toBe(false);
    expect(book.gaps.some((gap) => gap.includes("Public funding is not switched on"))).toBe(true);
  });
});
