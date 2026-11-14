import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { CalaClient } from "../../src/cala/contract";
import { CalaUnavailableError, NotFoundError } from "../../src/contract";
import { createRawStore } from "../../src/research";
import { ids, liveCala, type World, world } from "./helpers";

describe("from the store, with Cala latched off", () => {
  let w: World;

  beforeAll(async () => {
    w = await world();
  }, 120_000);

  afterAll(() => w.db.close());

  test("a founder mandate on Redpine produces a Book with sourced trails", async () => {
    const mandate = await w.mandates.create("founder", ids.redpine, { includePublicFunding: true });
    const result = await w.research.workMandate(mandate.id, mandate.ownerId);

    expect(result).toMatchObject({ requestsUsed: 0, partial: true, mandate: { stage: "challenging" } });
    expect(result.gaps[0]).toMatch(/^Cala is not answering; showing stored evidence from 2026-11-14T/);

    const book = await w.research.readBook(mandate.id, mandate.ownerId);

    expect(book.rows.length).toBe(result.rows);
    expect(book.rows.map((row) => row.rank)).toEqual(book.rows.map((_, index) => index + 1));
    expect(book.rows[0]).toMatchObject({
      candidate: { id: ids.luminar },
      category: "follow_up",
      enrichment: "read_in_full",
      hasBrief: true,
      bestTrail: { pattern: "T2", hopCount: 2, signalLabel: "Grant from ENOVA SF" },
    });
    expect(book.rows[0]!.reason).toContain("already backs you");
    expect(book.rows[0]!.reason).toContain("follow-up, not a new investor");
    expect(book.rows.filter((row) => row.hasBrief)).toHaveLength(3);
    expect(book.rows.find((row) => row.candidate.id === ids.enova)).toMatchObject({ category: "non_dilutive" });

    // Every row shows its trails, and every hop of every trail has a source.
    for (const row of book.rows) {
      const trails = await w.research.getTrails(mandate.id, mandate.ownerId, row.candidate.id);

      expect(trails.map((trail) => trail.id)).toEqual(row.trailIds);
      expect(trails.length).toBeGreaterThan(0);
      expect(trails.flatMap((trail) => trail.hops).every((hop) => hop.sources.length > 0)).toBe(true);
    }

    // Each criterion a row was ranked on is explained, and no line is a score.
    const criteria = new Set(book.rows.flatMap((row) => row.fit.map((line) => line.criterion)));

    expect([...criteria]).toEqual(
      expect.arrayContaining(["Trail", "Signal", "Independent trails", "Source strength", "Stage", "Portfolio examples", "Lead history"]),
    );
    expect(book.rows.flatMap((row) => row.fit).some((line) => /%|score/i.test(line.statement))).toBe(false);

    expect(book.coverage).toMatchObject({ rosterSize: 2988, probesStored: 3 });
    expect(book.coverage.entitiesReadInFull).toBeGreaterThan(25);
    expect(book.gaps.some((gap) => gap.includes("undirected investment ties"))).toBe(true);

    // The work log: stage changes, one read per entity consulted, one line per trail shown.
    const events = w.mandates.events.filter((event) => event.mandateId === mandate.id);
    const kinds = (kind: string) => events.filter((event) => event.kind === kind);

    expect(kinds("stage").map((event) => event.message)).toEqual(["Researching.", "Challenging."]);
    expect(kinds("read").every((event) => event.fromStore)).toBe(true);
    expect(kinds("read").some((event) => event.entity?.id === ids.luminar)).toBe(true);
    expect(kinds("probe")).toHaveLength(1);
    expect(kinds("probe")[0]).toMatchObject({ fromStore: true, entity: { id: ids.redpine } });
    expect(kinds("probe")[0]!.message).toContain("none found by Cala on 2026-11-14");
    expect(kinds("outage")).toHaveLength(1);
    expect(kinds("queued")).toHaveLength(1);
    expect(kinds("book")).toHaveLength(1);
    expect(kinds("trail").length).toBe(result.trailsFound);
    expect(kinds("trail")[0]!.message).toBe(
      "Trail T2: Redpine Technology AB – Luminar Ventures – Photoncycle; Grant from ENOVA SF, NOK 14,376,817, event date 2025-03-13.",
    );

    expect(await w.research.evidenceCounts(mandate.id)).toMatchObject({ trails: result.trailsFound });
    expect((await w.research.evidenceCounts(mandate.id)).sources).toBeGreaterThan(20);

    // A second pass finds nothing new and logs no trail twice.
    const again = await w.research.workMandate(mandate.id, mandate.ownerId);

    expect(again.trailsFound).toBe(0);
    expect(again.rows).toBe(result.rows);
  });

  test("an investor mandate on Kfund produces a Book with sourced trails", async () => {
    const mandate = await w.mandates.create("investor", ids.kfund);
    const result = await w.research.workMandate(mandate.id, mandate.ownerId);
    const book = await w.research.readBook(mandate.id, mandate.ownerId);

    expect(result.requestsUsed).toBe(0);
    expect(book.rows.length).toBeGreaterThan(0);
    expect(book.rows[0]).toMatchObject({
      candidate: { name: "Saturn Dynamics" },
      category: "lead",
      directFitOnly: false,
      enrichment: "seen_in_list",
      bestTrail: { pattern: "T1", hopCount: 3 },
    });

    const trails = await w.research.getTrails(mandate.id, mandate.ownerId, book.rows[0]!.candidate.id);

    // The strongest trail runs through the anchor whose direction roles settle: Kfund – Cala AI – Masia VC.
    expect(trails[0]!.hops.map((hop) => [hop.to.name, hop.direction])).toEqual([
      ["Cala AI", "from_funds_to"],
      ["Masia VC", "to_funds_from"],
      ["Saturn Dynamics", "undirected"],
    ]);
    expect(trails.flatMap((trail) => trail.hops).every((hop) => hop.sources.length > 0)).toBe(true);
    // Several anchors lead to Masia VC, but all of them enter Saturn Dynamics over one edge.
    expect(trails[0]!.independentTrails).toBe(1);
    expect(book.rows[0]!.unknowns).toContain("Its own record has not been read; it was seen only in another entity's list.");
  });

  test("a brief is assembled from the row's evidence, with its limits", async () => {
    const mandate = await w.mandates.create("founder", ids.redpine, { includePublicFunding: true });

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const brief = await w.research.getBrief(mandate.id, mandate.ownerId, ids.luminar);

    expect(brief).toMatchObject({ candidate: { id: ids.luminar }, category: "follow_up", revision: 1 });
    expect(brief.whyMeet[0]).toMatchObject({ criterion: "Reason to meet", kind: "inferred" });
    expect(brief.trails.length).toBeGreaterThan(0);
    expect(brief.whyHesitate.map((line) => line.criterion)).toEqual(
      expect.arrayContaining(["Dates disagree", "Our classification", "Existing backer", "What a trail shows"]),
    );
    // Luminar's own signals: the state-owned fund of funds behind it, by our classification.
    expect(brief.directSignals.some((signal) => signal.label === "Financing with Saminvest AB" && signal.publicBasis?.ours)).toBe(true);
    expect(brief.questions[0]).toContain("Ask Luminar Ventures how Photoncycle obtained it");
    expect(brief.stillUnknown.some((line) => line.includes("will be at Slush is unknown"))).toBe(true);
    expect(brief.coverageNote).toContain("Luminar Ventures was read in full on 2026-11-14.");
    expect(brief.coverageNote).toContain("no lead count is shown");

    await expect(w.research.getBrief(mandate.id, mandate.ownerId, ids.kuva)).rejects.toThrow(NotFoundError);
  });

  test("ownership already in a stored read is shown beside the candidate", async () => {
    const mandate = await w.mandates.create("investor", ids.luminar, { sectors: ["software"] });

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const brief = await w.research.getBrief(mandate.id, mandate.ownerId, ids.calaAi);

    expect(brief.ownership).toEqual([
      expect.objectContaining({ relation: "HAS_SUBSIDIARY", entity: expect.objectContaining({ name: "KOSMOVERA, S.L." }) }),
    ]);
    expect(brief.ownership[0]!.sources.length).toBeGreaterThan(0);
  });

  test("a constraint change reranks from the store under the next revision", async () => {
    const mandate = await w.mandates.create("founder", ids.redpine, { includePublicFunding: true });

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const before = await w.research.readBook(mandate.id, mandate.ownerId);
    const asked = (w.cala as CalaClient & { asked: unknown[] }).asked.length;

    expect(before.rows.slice(0, 3).map((row) => row.candidate.name)).toEqual([
      "Luminar Ventures",
      "ENOVA SF",
      "NORDICNINJA VC LIMITED",
    ]);
    // Without a stage from the customer, the company's own stage in Cala is what candidates are compared with.
    expect(before.rows[0]!.fit.find((line) => line.criterion === "Stage")!.statement).toContain("your company's record in Cala: SEED");

    // The customer rules out NordicNinja, switches public funding off and asks for Series A investors.
    const revised = w.mandates.revise(mandate, {
      exclusions: ["NORDICNINJA VC LIMITED"],
      includePublicFunding: false,
      stages: ["Series A"],
    });

    await w.research.rank(revised);

    const after = await w.research.readBook(mandate.id, mandate.ownerId);

    expect(after.mandate.revision).toBe(2);
    expect(after.rows.every((row) => row.revision === 2)).toBe(true);
    expect(after.rows.some((row) => row.candidate.id === ids.nordicNinja || row.category === "non_dilutive")).toBe(false);
    expect(after.gaps.some((gap) => gap.includes("left out by your exclusions: NORDICNINJA VC LIMITED"))).toBe(true);
    expect(after.gaps.some((gap) => gap.includes("Public funding is not switched on"))).toBe(true);

    // An explicit criterion with evidence is explained as the customer's own.
    const stage = after.rows[0]!.fit.find((line) => line.criterion === "Stage")!;

    expect(after.rows[0]!.candidate.id).toBe(ids.luminar);
    expect(stage.statement).toContain("stored Series A round");
    expect(stage.statement).toContain("your criteria: Series A");
    expect(stage.sources.length).toBeGreaterThan(0);
    expect(after.rows[1]!.category).toBe("lead");

    // No request was made for it, and the first revision's rows are still stored.
    expect((w.cala as CalaClient & { asked: unknown[] }).asked.length).toBe(asked);
    expect(
      (await w.db.query("select 1 from book_rows where mandate_id = $1 and revision = 1", [mandate.id])).length,
    ).toBe(before.rows.length);
  });

  test("conclusions are kept per mandate and only for its own trails", async () => {
    const mandate = await w.mandates.create("founder", ids.redpine);

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const [trail] = await w.research.getTrails(mandate.id, mandate.ownerId, ids.luminar);
    const conclusion = {
      trailId: trail!.id,
      reading: "Luminar already backs a company beside you that obtained a public grant.",
      because: "Redpine – Luminar Ventures – Photoncycle; grant from ENOVA SF.",
      doesNotProve: "It does not show that the programme is open to you.",
      ask: "Ask Luminar how Photoncycle applied.",
    };

    expect(trail!.conclusion).toBeNull();

    await w.research.saveConclusions(mandate.id, mandate.ownerId, [conclusion]);

    expect((await w.research.getTrails(mandate.id, mandate.ownerId, ids.luminar))[0]!.conclusion).toEqual(conclusion);
    expect((await w.research.getBrief(mandate.id, mandate.ownerId, ids.luminar)).questions[0]).toBe(conclusion.ask);

    await expect(
      w.research.saveConclusions(mandate.id, mandate.ownerId, [{ ...conclusion, trailId: "no-such-trail" }]),
    ).rejects.toThrow(NotFoundError);

    // Another guest cannot read or write this mandate.
    await expect(w.research.readBook(mandate.id, "guest-2")).rejects.toThrow(NotFoundError);
    await expect(w.research.saveConclusions(mandate.id, "guest-2", [conclusion])).rejects.toThrow(NotFoundError);

    // The same trail under another mandate carries no conclusion.
    const other = await w.mandates.create("founder", ids.redpine);

    await w.research.workMandate(other.id, other.ownerId);
    expect((await w.research.getTrails(other.id, other.ownerId, ids.luminar))[0]!.conclusion).toBeNull();
  });

  test("probe proposals rank the companies on the trails, and stored answers are reused", async () => {
    const mandate = await w.mandates.create("investor", ids.eib);

    await w.research.workMandate(mandate.id, mandate.ownerId);

    const proposals = await w.research.proposeProbes(mandate.id, mandate.ownerId);

    expect(proposals.map((proposal) => proposal.entity.name)).toEqual(
      expect.arrayContaining(["European Investment Bank", "ICEYE", "Kuva Space", "IHI Corporation"]),
    );
    expect(proposals.find((proposal) => proposal.entity.id === ids.kuva)!.alreadyProbedAt).toMatch(/^2026-11-14T/);
    expect(proposals[0]).toMatchObject({ entity: { id: ids.eib }, alreadyProbedAt: null });

    const signals = await w.research.checkSignals(mandate.id, mandate.ownerId, [ids.kuva]);

    expect(signals.map((signal) => signal.label)).toEqual(
      expect.arrayContaining(["Memorandum of understanding with IHI Corporation", "Customer agreement with CHATEAU PUYBARBE"]),
    );
    expect(signals.every((signal) => signal.type !== "agreement" || (signal.origin === "derived" && signal.claim))).toBe(true);

    const probe = w.mandates.events.filter((event) => event.mandateId === mandate.id && event.kind === "probe").at(-1)!;

    expect(probe).toMatchObject({ fromStore: true, entity: { id: ids.kuva } });
    expect(probe.message).toContain("4 agreements reported, 2 with both parties resolved");

    // A stored answer does not use up one of the mandate's six probes.
    expect(await w.db.query("select from_store from mandate_probes where mandate_id = $1", [mandate.id])).toEqual([{ from_store: true }]);

    // With Cala latched, an entity never asked about is left as a gap and not as a finding.
    expect(await w.research.checkSignals(mandate.id, mandate.ownerId, [ids.photoncycle])).not.toContainEqual(
      expect.objectContaining({ type: "agreement" }),
    );
    expect(w.mandates.events.at(-1)).toMatchObject({ kind: "queued", message: "Not asked: signal probe for Photoncycle." });
  });

  test("entities are found in the store first, and Cala is asked only when the store has nothing close", async () => {
    const cala = w.cala as CalaClient & { asked: { kind: string }[] };
    const before = cala.asked.length;
    const matches = await w.research.findEntity("redpine");

    expect(matches[0]).toMatchObject({ id: ids.redpine, stored: true, slushAttendee: true });
    expect(cala.asked.length).toBe(before);

    // "Lifeline Ventures" was searched for in round 4; the latched client answers it from the store.
    const searched = await w.research.findEntity("Lifeline Ventures", { limit: 6 });

    expect(searched.length).toBeGreaterThan(0);

    // A name nobody has seen: Cala is asked, refuses, and the answer is an honest nothing.
    expect(await w.research.findEntity("Zzyzx Nonexistent Holdings")).toEqual([]);
    expect(cala.asked.at(-1)).toMatchObject({ kind: "search_entities", name: "Zzyzx Nonexistent Holdings" });

    expect(await w.research.entityRef(ids.kuva)).toMatchObject({ name: "Kuva Space", entityType: "Company" });
    await expect(w.research.entityRef("00000000-0000-0000-0000-000000000000")).rejects.toThrow(NotFoundError);
    await expect(w.research.getDossier("00000000-0000-0000-0000-000000000000")).rejects.toThrow(NotFoundError);
  });

  test("coverage reports the latch as the store holds it", async () => {
    expect((await w.research.getCoverage()).cala).toBe("answering");

    await createRawStore(w.db).setLatch({ latched: true, reason: "HTML 403 from awselb/2.0" });

    const coverage = await w.research.getCoverage();

    expect(coverage).toMatchObject({ cala: "latched", rosterSize: 2988, hubsRead: 9 });
    expect(coverage.calaCheckedAt).toBeTruthy();
    expect(coverage.rosterFetchedAt).toBe("2026-11-14T10:02:00.000Z");

    await createRawStore(w.db).setLatch({ latched: false, reason: null });
  });
});

describe("a cold subject, with Cala answering", () => {
  test("a cold company is worked inside the 25-request pass and yields the grant trail", async () => {
    const cala = await liveCala();
    // The model's reading of the live answer: no agreements in it.
    const w = await world({ fixtures: "roster", cala: () => cala, extract: async () => [] });

    // The roster names the company, so hiring needs no request; nothing else is stored about it.
    const mandate = await w.mandates.create("founder", ids.redpine, { includePublicFunding: true });

    expect(cala.sent).toHaveLength(0);

    const result = await w.research.workMandate(mandate.id, mandate.ownerId);

    expect(result.requestsUsed).toBeLessThanOrEqual(25);
    expect(cala.sent.length).toBe(result.requestsUsed);
    expect(cala.sent[0]).toMatchObject({ kind: "entity", entityId: ids.redpine });
    expect(cala.sent.filter((request) => request.kind === "knowledge_search")).toHaveLength(1);

    const book = await w.research.readBook(mandate.id, mandate.ownerId);

    expect(book.rows.find((row) => row.candidate.id === ids.luminar)).toMatchObject({
      category: "follow_up",
      bestTrail: { pattern: "T2", signalLabel: "Grant from ENOVA SF" },
    });

    // Backers Cala could not return are gaps, said plainly, and the pass is partial.
    expect(result.partial).toBe(true);
    expect(result.gaps.some((gap) => gap.startsWith("node.vc could not be read"))).toBe(true);

    const events = w.mandates.events.filter((event) => event.mandateId === mandate.id);

    expect(events.filter((event) => event.kind === "read" && !event.fromStore).length).toBeGreaterThan(2);
    expect(events.find((event) => event.kind === "probe")).toMatchObject({ fromStore: false });
    expect(events.find((event) => event.kind === "probe")!.message).toContain("none found by Cala");

    // The live probe used one of the mandate's six.
    expect(await w.db.query("select from_store from mandate_probes where mandate_id = $1", [mandate.id])).toEqual([{ from_store: false }]);

    await w.db.close();
  }, 60_000);

  test("a cold fund is read hub first, then anchors, then their other backers", async () => {
    const cala = await liveCala();
    const w = await world({ fixtures: "roster", cala: () => cala });
    const mandate = await w.mandates.create("investor", ids.kfund);
    const result = await w.research.workMandate(mandate.id, mandate.ownerId);

    expect(result.requestsUsed).toBeLessThanOrEqual(25);

    const entityReads = cala.sent.flatMap((request) => (request.kind === "entity" ? [request.entityId] : []));

    expect(entityReads[0]).toBe(ids.kfund);
    expect(entityReads.indexOf(ids.calaAi)).toBeGreaterThan(0);
    expect(entityReads.indexOf(ids.masia)).toBeGreaterThan(entityReads.indexOf(ids.calaAi));
    // An investor's pass asks no probe unless Cabala picked one.
    expect(cala.sent.some((request) => request.kind === "knowledge_search")).toBe(false);

    const book = await w.research.readBook(mandate.id, mandate.ownerId);

    expect(book.rows[0]).toMatchObject({ candidate: { name: "Saturn Dynamics" }, category: "lead" });
    expect(result.trailsFound).toBeGreaterThan(0);

    await w.db.close();
  }, 60_000);

  test("a spent budget ends the pass with partial results and no promise", async () => {
    const cala = await liveCala();
    const w = await world({ fixtures: "roster", cala: () => cala });
    const mandate = await w.mandates.create("founder", ids.redpine);
    const result = await w.research.workMandate(mandate.id, mandate.ownerId, { budget: 2 });

    expect(result.requestsUsed).toBe(2);
    expect(result.partial).toBe(true);
    expect(result.gaps.some((gap) => gap.startsWith("The pass reached its ceiling of 2 Cala requests. Not read:"))).toBe(true);
    expect(result.gaps.join(" ")).not.toMatch(/will be|shortly|soon|promise/i);
    expect(w.mandates.events.some((event) => event.kind === "queued")).toBe(true);

    await w.db.close();
  }, 60_000);

  test("a refusal in the middle of a pass latches live work off and keeps what was read", async () => {
    const live = await liveCala();
    let answered = 0;
    const cala: CalaClient = {
      ...live,
      async request(request, options) {
        // Six answers, then every request is refused as when the load balancer returns its 403.
        if (answered >= 6) throw new CalaUnavailableError("Cala refused the request.");

        answered += 1;

        return live.request(request, options);
      },
    };
    const w = await world({ fixtures: "roster", cala: () => cala });
    const mandate = await w.mandates.create("founder", ids.redpine);
    const result = await w.research.workMandate(mandate.id, mandate.ownerId);

    const outage = result.gaps.find((gap) => gap.startsWith("Cala is not answering; showing stored evidence from "))!;

    expect(result.partial).toBe(true);
    expect(outage).toBeTruthy();
    expect(w.mandates.events.filter((event) => event.kind === "outage")).toHaveLength(1);
    // What was read before the refusal is in the Book: Luminar, with its portfolio beside Redpine.
    expect(result.rows).toBeGreaterThan(0);

    const book = await w.research.readBook(mandate.id, mandate.ownerId);

    expect(book.gaps).toContain(outage);
    expect(book.rows[0]).toMatchObject({ candidate: { id: ids.luminar }, category: "follow_up", bestTrail: { pattern: "T1", signalLabel: null } });

    await w.db.close();
  }, 60_000);

  test("a subject nobody can read returns a gap and an empty Book", async () => {
    const w = await world({ fixtures: "roster" });
    // Zynap is on the Slush roster and nothing else is stored about it.
    const [zynap] = await w.research.findEntity("Zynap");
    const mandate = await w.mandates.create("founder", zynap!.id);
    const result = await w.research.workMandate(mandate.id, mandate.ownerId);

    expect(result).toMatchObject({ requestsUsed: 0, rows: 0, trailsFound: 0, partial: true });
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Cala is not answering; showing stored evidence from /),
        "No investor of your company is in stored evidence, so no trail could start.",
        "Zynap has not been read in full, so trails rest on what other entities' lists show.",
        "No candidate has a demonstrated connection in stored evidence.",
      ]),
    );

    await w.db.close();
  }, 60_000);

  test("an answer the extractor cannot read is stored as reported, with a gap", async () => {
    const cala = await liveCala();
    const w = await world({
      fixtures: "roster",
      cala: () => cala,
      extract: async () => {
        throw new Error("the model is unavailable");
      },
    });
    const mandate = await w.mandates.create("founder", ids.redpine);

    await w.research.checkSignals(mandate.id, mandate.ownerId, [ids.redpine]);

    const events = w.mandates.events.filter((event) => event.mandateId === mandate.id);

    expect(events.find((event) => event.kind === "gap")!.message).toContain("could not be read for agreements (the model is unavailable)");
    expect(events.find((event) => event.kind === "probe")!.message).toContain("claims stored as reported");
    // Not read is not the same as nothing found: the dossier makes no "none found" statement.
    expect((await w.research.getDossier(ids.redpine)).unresolvedClaims.map((claim) => claim.claim.slice(0, 10))).toEqual(["The provid"]);

    await w.db.close();
  }, 60_000);

  test("a mandate asks at most six new signal probes", async () => {
    const cala = await liveCala();
    const w = await world({ fixtures: "roster", cala: () => cala });
    const mandate = await w.mandates.create("founder", ids.redpine);
    const others = (await w.db.query<{ entity_id: string }>("select entity_id from roster order by entity_id limit 7")).map((row) => row.entity_id);

    // Six slots are taken by earlier probes of this mandate.
    for (const id of others.slice(0, 6)) {
      await w.db.query("insert into mandate_probes (mandate_id, entity_id, from_store) values ($1, $2, false)", [mandate.id, id]);
    }

    const sent = cala.sent.length;

    await w.research.checkSignals(mandate.id, mandate.ownerId, [ids.redpine]);

    expect(cala.sent.length).toBe(sent);
    expect(w.mandates.events.at(-1)).toMatchObject({ kind: "queued", message: "Not asked: signal probe for Redpine Technology AB." });

    await w.db.close();
  }, 60_000);
});
