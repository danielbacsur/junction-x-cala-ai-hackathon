import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { requestId } from "../../src/cala/id";
import type { Book } from "../../src/contract";
import { partyKind, roundKind } from "../../src/research/money";
import { narrowStarBody, roundBody } from "../../src/research/requests";
import { computeTrails } from "../../src/research/trails";
import { ids, ingestRecords, NOW, type World, world } from "./helpers";

/**
 * A public body is non-dilutive only on a grant or a loan. Every case here is a record Cala
 * returned: the committed fixtures, and seven reads from the Slush crawl of 2026-11-14 kept in
 * records/ as the crawler saved them. The one synthetic record is marked where it is made.
 */

const real = {
  confidentialMind: "e2ca4eed-eb90-4bc8-ad76-f711dd5f80df",
  curifyLabs: "f9bf65a6-a85e-46ad-b086-d2c0cfd3a7b7",
  tesi: "df5be140-d50e-4e21-bb4f-d8f1e4ad3959",
  trustNxt: "15fe4d14-50d7-481b-91bd-724a852039ab",
  htgf: "a2abbba3-d423-4c3b-abb4-e0e24c05e91d",
  ifb: "43f1235b-4325-4e2f-8d90-bd0e4b2a99c1",
  industrifonden: "7684b497-6faa-4239-8344-597c42d95999",
  eic: "b7143bb3-c9a2-421e-ae61-d2c33088f953",
  almi: "765c581e-4adf-4227-98c8-3f9d1eb48455",
  samplimy: "8e736b1c-dfd7-5ac9-acf8-2742e1e74208",
};

let w: World;

beforeAll(async () => {
  w = await world();

  await ingestRecords(w.research, [
    "star-confidentialmind",
    // Tesi, Lifeline Ventures and two more as INVESTOR in a round read with instrument EQUITY.
    "round-series-a-curifylabs",
    // The European Innovation Council as INVESTOR in Embedl's seed and as GRANTOR of its grant.
    "round-seed-embedl",
    "round-grant-embedl-eic",
    // VINNOVA, which granted to Redpine, as GRANTOR to Embedl and to Samplimy Medical.
    "round-grant-embedl-vinnova",
    "round-grant-samplimy-vinnova",
    // Almi Invest, which is in no registry, as LENDER to Samplimy Medical.
    "round-loan-samplimy-almi",
  ]);
}, 120_000);

afterAll(() => w.db.close());

async function book(subjectId: string, includePublicFunding: boolean): Promise<Book> {
  const mandate = await w.mandates.create("founder", subjectId, { includePublicFunding });

  await w.research.workMandate(mandate.id, mandate.ownerId);

  return w.research.readBook(mandate.id, mandate.ownerId);
}

const row = (of: Book, candidateId: string) => of.rows.find((one) => one.candidate.id === candidateId);

describe("what kind of money a party put into a round", () => {
  test("is read from the instrument of a round that was read, and from its name when it was not", () => {
    expect(roundKind({ instrument: "GRANT", name: "Seed" })).toBe("grant");
    expect(roundKind({ instrument: "LOAN_FACILITY", name: "Debt Financing" })).toBe("loan");
    expect(roundKind({ instrument: "PREFERRED_EQUITY", name: "Pre-Series A" })).toBe("equity");
    // Cala names one round "Debt Financing" and gives its instrument as convertible notes.
    expect(roundKind({ instrument: "CONVERTIBLE_NOTES", name: "Debt Financing" })).toBe("equity");
    expect(roundKind({ instrument: "SAFE", name: "Seed" })).toBe("equity");

    expect(roundKind({ instrument: null, name: "Grant round" })).toBe("grant");
    expect(roundKind({ instrument: null, name: "Venture Debt" })).toBe("loan");

    for (const name of ["Seed", "Pre-Seed", "Seed+", "Series A", "Angel", "Equity round", "Convertible Notes round", "SAFE round"]) {
      expect(roundKind({ instrument: null, name })).toBe("equity");
    }

    for (const name of ["Funding round", "FINANCING_RAISED_OR_FACILITY_ENTERED", "Tranche 1", null]) {
      expect(roundKind({ instrument: null, name })).toBe("unknown");
    }

    // An instrument we cannot read is not second-guessed from the name.
    expect(roundKind({ instrument: "OTHER", name: "Grant" })).toBe("unknown");
  });

  test("is the party's own, not the round's, where Cala lists investors beside a grantor", () => {
    const grant = { instrument: "GRANT", name: "Grant" };
    const seed = { instrument: "EQUITY", name: "Seed" };

    expect(partyKind("GRANTOR", grant, true)).toBe("grant");
    expect(partyKind("LENDER", { instrument: null, name: "FINANCING_RAISED_OR_FACILITY_ENTERED" }, true)).toBe("loan");
    expect(partyKind("INVESTOR", seed, false)).toBe("equity");

    // Fairbrics' grant names the European Commission as GRANTOR and three investors beside it.
    expect(partyKind("INVESTOR", grant, true)).toBe("unknown");
    // A grant with no grantor named: the investor is the only financier the record has.
    expect(partyKind("INVESTOR", { instrument: null, name: "Grant" }, false)).toBe("grant");
    // Raidium's seed, instrument EQUITY, names Bpifrance as GRANTOR: the record settles nothing.
    expect(partyKind("GRANTOR", seed, true)).toBe("unknown");
    expect(partyKind("INVESTOR", { instrument: null, name: "FINANCING_RAISED_OR_FACILITY_ENTERED" }, false)).toBe("unknown");
  });
});

describe("a public body in an equity round", () => {
  test("is a lead like any other investor, and is said to be public and on whose word", async () => {
    const found = await book(real.confidentialMind, true);
    const tesi = row(found, real.tesi)!;

    expect(tesi).toMatchObject({ category: "lead", bestTrail: { pattern: "T1", hopCount: 3, signalLabel: null } });
    expect(tesi.reason).toBe(
      "Tesi, a public investor by Cala's description, backs CurifyLabs (roles in the same round), a company beside you through Lifeline Ventures; Lifeline Ventures is the route to ask about.",
    );

    // The round was read: its instrument decides, and Tesi's role in it is INVESTOR.
    const [signal] = (await w.research.getDossier(real.curifyLabs)).signals;

    expect(signal).toMatchObject({
      type: "public_money",
      label: "Series A with Tesi, Lifeline Ventures, HealthCap and 1 more",
      instrument: "EQUITY",
      publicBasis: { ours: false },
    });
    expect(signal!.parties.find((party) => party.entity.id === real.tesi)!.role).toBe("INVESTOR");

    // The question about an equity round does not ask how it was "obtained", as one about a grant does.
    const lifeline = await w.research.getBrief(found.mandate.id, found.mandate.ownerId, "476a73ac-afa2-4713-9f73-188bc7ec0b95");

    expect(lifeline.questions).toContain(
      "Ask Lifeline Ventures about it: Series A with Tesi, Lifeline Ventures, HealthCap and 1 more, USD 14,000,000, announcement date 2026-07-06.",
    );

    // Its trail is the full three hops to Tesi, never the shorter one to the company it backs.
    const trails = await w.research.getTrails(found.mandate.id, found.mandate.ownerId, real.tesi);

    expect(trails.map((trail) => [trail.end.id, trail.hopCount])).toEqual([[real.tesi, 3]]);
    expect(trails[0]!.hops[2]).toMatchObject({ from: { id: real.curifyLabs }, direction: "to_funds_from", role: "INVESTOR" });
  });

  test("is decided from the round's stored name when the round has not been read", async () => {
    // High-Tech Gründerfonds is INVESTOR in TrustNXT's pre-seed, which only two lists show.
    expect(
      await w.db.query(
        `select rounds.name, rounds.instrument, rounds.read_at, p.role from participations p
         join rounds on rounds.id = p.round_id
         join participations issuer on issuer.round_id = p.round_id and issuer.entity_id = $2 and issuer.role = 'ISSUER'
         where p.entity_id = $1`,
        [real.htgf, real.trustNxt],
      ),
    ).toEqual([{ name: "Pre-Seed", instrument: null, read_at: null, role: "INVESTOR" }]);

    const htgf = row(await book(real.confidentialMind, true), real.htgf)!;

    expect(htgf.category).toBe("lead");
    expect(htgf.reason).toContain("High-Tech Gründerfonds GmbH & Co. KG, a public investor by our classification, backs TrustNXT");
  });

  test("leaves the grantor of the same company non-dilutive", async () => {
    const found = await book(real.confidentialMind, true);
    const ifb = row(found, real.ifb)!;

    expect(ifb).toMatchObject({ category: "non_dilutive", bestTrail: { pattern: "T2", hopCount: 2, signalLabel: "Grant from IFB Innovationsstarter GmbH" } });
    expect(ifb.reason).toContain("IFB Innovationsstarter GmbH is a public funder by our classification active beside you");

    // Nothing in the non-dilutive category rests on anything but a grant or a loan.
    for (const one of found.rows.filter((each) => each.category === "non_dilutive")) {
      expect(one.bestTrail!.signalLabel).toMatch(/^(Grant|Loan) from /);
    }
  });

  test("stays listed when public funding is switched off, which only removes the non-dilutive category", async () => {
    const found = await book(real.confidentialMind, false);

    expect(row(found, real.tesi)).toMatchObject({ category: "lead" });
    expect(row(found, real.htgf)).toMatchObject({ category: "lead" });
    expect(row(found, real.ifb)).toBeUndefined();
    expect(found.rows.some((one) => one.category === "non_dilutive")).toBe(false);
    expect(found.gaps).toContain(
      "1 public funder has made grants or loans to you or to companies beside you. Public funding is not switched on in this mandate, so it is not listed as a non-dilutive candidate.",
    );
  });

  test("is a follow-up when it already backs the customer", async () => {
    for (const includePublicFunding of [true, false]) {
      const htgf = row(await book(real.trustNxt, includePublicFunding), real.htgf)!;

      expect(htgf.category).toBe("follow_up");
      expect(htgf.reason).toContain("High-Tech Gründerfonds GmbH & Co. KG, a public investor by our classification, already backs you");
      expect(htgf.reason).toContain("this is a follow-up, not a new investor");
    }
  });
});

describe("a public body named on a signal that the trail cap keeps", () => {
  test("keeps its own trail too, so it is not dropped where two-hop trails fill the cap", async () => {
    const subject = await w.research.entityRef(real.confidentialMind);
    // A cap of three leaves room for two-hop trails only, as 400 does for a well-connected company.
    const kept = await computeTrails(w.db, subject, "founder", NOW, 3);
    const beyond = kept.slice(3);

    expect(kept.slice(0, 3).every((trail) => trail.hopCount === 2)).toBe(true);
    expect(kept.slice(0, 3).some((trail) => trail.signal?.label === "Series A with Tesi, Lifeline Ventures, HealthCap and 1 more")).toBe(true);

    // Tesi's trail to CurifyLabs survives the cap. HealthCap's, which is no public body's, does not.
    expect(beyond.length).toBeGreaterThan(0);
    expect(beyond.every((trail) => trail.hopCount === 3)).toBe(true);
    expect(beyond.map((trail) => trail.end.id)).toContain(real.tesi);
    expect(beyond.some((trail) => trail.end.name === "HealthCap")).toBe(false);

    // The next ranking stores the full set again.
    await computeTrails(w.db, subject, "founder", NOW);
  });
});

describe("a public body whose money the record does not name", () => {
  test("is a lead, called a body and not an investor, with the reason it is not non-dilutive", async () => {
    // Stiftelsen Industrifonden is tied to Open Payments Europe by an INVESTED_IN edge alone.
    const industrifonden = row(await book(ids.redpine, true), real.industrifonden)!;

    expect(industrifonden.category).toBe("lead");
    expect(industrifonden.reason).toBe(
      "STIFTELSEN INDUSTRIFONDEN, a public body by our classification, has an investment tie with Open Payments Europe AB (direction not settled), a company beside you through Luminar Ventures; Luminar Ventures is the route to ask about.",
    );
    expect(industrifonden.unknowns).toContain(
      "Stored rounds do not say what kind of money ties it to this trail, so it is not listed as non-dilutive: only a grant, a subsidy or a loan would make it that.",
    );
  });
});

describe("a public body that granted and also invested", () => {
  test("is non-dilutive on the grant when public funding is wanted, and an investor when it is not", async () => {
    // Both of the European Innovation Council's roles are in rounds of the same company.
    expect(
      await w.db.query(
        `select rounds.name, rounds.instrument, p.role from participations p join rounds on rounds.id = p.round_id
         where p.entity_id = $1 and p.observed_on = p.round_id order by rounds.name`,
        [real.eic],
      ),
    ).toEqual([
      { name: "Grant", instrument: "GRANT", role: "GRANTOR" },
      { name: "Seed", instrument: "EQUITY", role: "INVESTOR" },
    ]);

    const on = await book(ids.redpine, true);
    const wanted = row(on, real.eic)!;

    expect(wanted).toMatchObject({ category: "non_dilutive", bestTrail: { pattern: "T2", signalLabel: "Grant from European Innovation Council" } });
    expect(wanted.reason).toContain("European Innovation Council is a public funder by Cala's description active beside you: Grant from European Innovation Council");
    // The way to Embedl is VINNOVA, which granted to both: a shared funder, not an investor to ask.
    expect(wanted.reason).toMatch(/ for Embedl, which VINNOVA funds as it funds you\.$/);
    expect(wanted.reason).not.toContain("Ask VINNOVA");

    // Nor does its brief put that question to VINNOVA.
    const brief = await w.research.getBrief(on.mandate.id, on.mandate.ownerId, real.eic);

    expect(brief.trails.some((trail) => trail.pattern === "T2" && trail.hops[0]!.role === "GRANTOR")).toBe(true);
    expect(brief.questions.some((question) => question.startsWith("Ask VINNOVA"))).toBe(false);

    const off = await book(ids.redpine, false);

    expect(row(off, real.eic)).toMatchObject({ category: "lead", bestTrail: { pattern: "T1", hopCount: 3 } });
    expect(row(off, real.eic)!.reason).toBe(
      "European Innovation Council, a public investor by Cala's description, backs Embedl (roles in the same round), a company that VINNOVA funds as it funds you.",
    );
    // ENOVA and Innovation Norway (Photoncycle), the Council and VINNOVA (Embedl).
    expect(off.gaps.some((gap) => gap.startsWith("4 public funders have made grants or loans to you or to companies beside you."))).toBe(true);
  });

  test("names its stakes in other companies beside the row, and does not rest the row on them", async () => {
    // Synthetic: written for this test, never returned by Cala. ENOVA, a grantor of Photoncycle,
    // is given a seed stake in a second company that Luminar Ventures backs. IFB Innovationsstarter,
    // which nothing else ties to Redpine, is given the same stake and a grant too old to be a signal.
    const sources = [{ name: "example.test", document: "https://example.test/stake", date: "2026-06-01", source_rank: "PRIMARY" }];
    const party = (id: string, name: string, type: string, role?: string) => ({ id, name, entity_type: type, properties: { sources, ...(role ? { role } : {}) } });
    const read = (id: string, body: unknown, properties: Record<string, unknown>, relationships: unknown, name: string, type: string) => {
      const request = { kind: "entity", entityId: id, body } as const;

      return {
        id: requestId(request),
        request,
        status: 200,
        fetchedAt: NOW.toISOString(),
        seconds: 0.1,
        body: { id, name, entity_type: type, description: null, properties, relationships },
        fromStore: false,
        provenance: { fixture: "test", note: "Synthetic: written for one test, never returned by Cala." },
      };
    };
    const round = (id: string, name: string, instrument: string, date: string, funders: ReturnType<typeof party>[]) =>
      read(
        id,
        roundBody,
        { instrument: { value: instrument, sources }, event_date: { value: date, sources } },
        { outgoing: {}, incoming: { PARTICIPATES_IN_FUNDING_ROUND: [party("stake-co", "Stake Company", "Company", "ISSUER"), ...funders] } },
        name,
        "FundingRound",
      );

    await w.research.ingest(
      read("stake-co", narrowStarBody, {}, { outgoing: {}, incoming: { INVESTED_IN: [party(ids.luminar, "Luminar Ventures", "Organization")] } }, "Stake Company", "Company"),
    );
    await w.research.ingest(
      round("round-stake", "Seed", "EQUITY", "2026-05-01", [
        party(ids.enova, "ENOVA SF", "Company", "INVESTOR"),
        party(real.ifb, "IFB Innovationsstarter GmbH", "Company", "INVESTOR"),
      ]),
    );
    await w.research.ingest(round("round-old-grant", "Grant", "GRANT", "2020-03-01", [party(real.ifb, "IFB Innovationsstarter GmbH", "Company", "GRANTOR")]));

    const wanted = await book(ids.redpine, true);
    const enova = row(wanted, ids.enova)!;

    expect(enova).toMatchObject({ category: "non_dilutive", bestTrail: { signalLabel: "Grant from ENOVA SF" } });
    expect(enova.fit.find((line) => line.criterion === "Also an investor")!.statement).toBe(
      "Stored rounds also tie it to Stake Company beside you through equity or money of a kind they do not name. That is not non-dilutive funding and is not what this row rests on.",
    );

    // None of the trails the row shows ends at the stake.
    const trails = await w.research.getTrails(wanted.mandate.id, wanted.mandate.ownerId, ids.enova);

    expect(trails.length).toBeGreaterThan(0);
    expect(trails.some((trail) => trail.hops.some((hop) => hop.to.id === "stake-co" || hop.from.id === "stake-co"))).toBe(false);

    // A body with a grant and a stake in the one company: its non-dilutive row names the grant.
    expect(row(wanted, real.ifb)).toMatchObject({ category: "non_dilutive", bestTrail: { pattern: "T1", hopCount: 3, signalLabel: null } });
    expect(row(wanted, real.ifb)!.reason).toBe(
      "IFB Innovationsstarter GmbH, a public funder by our classification, made a grant to Stake Company (roles in the same round), a company beside you through Luminar Ventures; Luminar Ventures is the route to ask about.",
    );

    // With public funding off the same bodies are listed on the stake alone.
    const off = await book(ids.redpine, false);

    expect(row(off, ids.enova)!.category).toBe("lead");
    expect(row(off, ids.enova)!.reason).toContain("ENOVA SF, a public investor by our classification, backs Stake Company (roles in the same round)");
    expect(row(off, real.ifb)!.category).toBe("lead");
    expect(row(off, real.ifb)!.reason).toContain("IFB Innovationsstarter GmbH, a public investor by our classification, backs Stake Company");
  });
});

describe("a grantor or lender outside the registry", () => {
  test("is a lead whose reason names the loan, and is not called public or an investor", async () => {
    // The loan stays a financing with its instrument: nothing classes Almi Invest as public.
    expect((await w.research.getDossier(real.samplimy)).signals).toContainEqual(
      expect.objectContaining({ type: "financing", label: "Loan from Almi Invest AB", instrument: "LOAN_FACILITY", publicBasis: null }),
    );

    for (const includePublicFunding of [true, false]) {
      const almi = row(await book(ids.redpine, includePublicFunding), real.almi)!;

      expect(almi.category).toBe("lead");
      expect(almi.reason).toBe(
        "Almi Invest AB made a loan to Samplimy Medical (roles in the same round), a company that VINNOVA funds as it funds you.",
      );
      expect(almi.unknowns).toContain(
        "Stored rounds show it granting or lending, not investing. It is not in the public-funder registry, so it is not listed as a public funder.",
      );
    }
  });
});

describe("a public funder the customer already has", () => {
  test("is worded as the funder it already is, and never as the giver of someone else's grant", async () => {
    // VINNOVA granted to Redpine and to Embedl, so the trail to Embedl runs through VINNOVA.
    const vinnova = row(await book(ids.redpine, true), ids.vinnova)!;

    expect(vinnova.category).toBe("non_dilutive");
    expect(vinnova.reason).toMatch(/^VINNOVA, a public funder by our classification, already funds you and is tied to (Embedl|Samplimy Medical)\. \1 carries: /);
    expect(vinnova.reason).toMatch(/This is a funder you already have, not a new one\.$/);
    expect(vinnova.reason).not.toContain("Ask VINNOVA how");

    // Its grant is not equity, so with public funding off it is not turned into a follow-up.
    expect(row(await book(ids.redpine, false), ids.vinnova)).toBeUndefined();
  });
});
