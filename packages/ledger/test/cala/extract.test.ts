import { MockLanguageModelV4 } from "ai/test";
import { afterEach, expect, test, vi } from "vitest";

import { agreementModel, checkAgreements, createAgreementExtractor } from "../../src/cala/extract";
import type { ExtractedAgreement, ProbeAnswer } from "../../src/contract";
import { probes, savedProbe } from "./probe";

const KUVA = probes.kuva.subject.id;
const ICEYE = probes.iceye.subject.id;

/** Entities Cala resolved in the saved answers. IHI has the same ID in the ICEYE and the Kuva Space answer. */
const ids = {
  nasa: "903f54b0-1bb2-406c-8bcc-9b80df792a75",
  ihi: "6d909137-a0a9-414c-bc93-40cbf5f6acd8",
  esa: "9bfb7eb4-0dab-415b-ac4c-861b03eb3aec",
  puybarbe: "8a37b7fa-e810-5656-aa41-9251ba8ffd94",
  polishArmedForces: "1006ef7e-00dc-4e9a-bc1d-a4a87ae27130",
  germanArmedForces: "0695668e-837b-44de-bd85-464a64bda0f6",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A model that answers every call with the given text. */
function says(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

/** One reading with every field set, so a test states only what it is about. */
function row(...parts: Partial<ExtractedAgreement>[]): ExtractedAgreement {
  return Object.assign(
    {
      claimIndex: 0,
      partyA: "",
      partyB: "",
      partyAId: null,
      partyBId: null,
      type: "other",
      date: null,
      datePrecision: null,
      status: "executed",
      value: null,
      units: null,
      valueIsProgrammeCeiling: false,
      aboutSubjectItself: true,
    } satisfies ExtractedAgreement,
    ...parts,
  );
}

const kuva = { partyA: "Kuva Space", partyAId: KUVA };
const iceye = { partyA: "ICEYE", partyAId: ICEYE };

/** The fields of a reading that is about another body than the probed entity. */
const notItself = { partyAId: null, aboutSubjectItself: false };

const claim = (claimIndex: number, type: ExtractedAgreement["type"]) => ({ claimIndex, type });
const counterparty = (partyB: string, partyBId: string | null = null) => ({ partyB, partyBId });
const worth = (value: number, units: string) => ({ value, units });

/** A date with the precision its form shows. */
function dated(date: string): Pick<ExtractedAgreement, "date" | "datePrecision"> {
  return { date, datePrecision: (["year", "month", "day"] as const)[date.split("-").length - 1] };
}

/** A small answer about Acme, written for one rule at a time. */
function answer(text: string, passage = "", entities: ProbeAnswer["entities"] = []): ProbeAnswer {
  const source = { name: null, url: null, date: null, rank: null };

  return {
    subject: { id: "acme-id", name: "Acme Robotics Oy", entityType: "Company", description: null },
    question: "Which agreements has Acme Robotics Oy announced?",
    claims: [{ index: 0, text, passages: [{ text: passage, source }] }],
    entities,
  };
}

const ministry = {
  id: "ministry-id",
  name: "Ministry of Defence of Finland",
  entityType: "Organization",
  mentions: ["Finnish Ministry of Defence"],
};

test("one schema-bound call reads the claims, their passages and the entities", async () => {
  const reading = [row(claim(4, "mou"), kuva, counterparty("IHI Corporation", ids.ihi), dated("2026"))];
  const model = says(JSON.stringify({ agreements: reading }));

  expect(await createAgreementExtractor({ model })(savedProbe("kuva"))).toEqual(reading);
  expect(model.doGenerateCalls).toHaveLength(1);

  const [call] = model.doGenerateCalls;
  const sent = JSON.stringify(call.prompt);

  expect(call.responseFormat).toMatchObject({ type: "json", name: "agreements" });
  expect(JSON.stringify(call.responseFormat).includes("valueIsProgrammeCeiling")).toBe(true);

  // The instructions, the probed entity, the entities, a claim, a cited passage and its source.
  for (const part of [
    "leave a field null when it is not stated",
    KUVA,
    ids.ihi,
    "IDIQ contract with a maximum ceiling of",
    "Kuva US Inc., the U.S. subsidiary of Finland-based Kuva Space",
    "bebeez.eu/2026/07/01/kuva-space-scores-nasa-contract",
  ]) {
    expect(sent.includes(part), part).toBe(true);
  }
});

test("the Kuva Space answer: a subsidiary's award is not Kuva Space's, and a ceiling is no contract", async () => {
  const nasa = counterparty("NASA", ids.nasa);
  const syke = "Finnish Environment Institute (Syke)";

  const careless = [
    // The award belongs to Kuva US Inc., and $476 million is the ceiling of the whole programme.
    row(claim(0, "government_contract"), kuva, nasa, dated("2026-06-18"), worth(476_000_000, "USD")),
    // The same award under the claim whose passage, not its text, names the subsidiary.
    row(claim(1, "partnership"), kuva, nasa),
    // Syke is not among the entities Cala resolved, whatever ID the model attaches.
    row(claim(2, "partnership"), kuva, counterparty(syke, ids.esa), dated("2025-07-03")),
    // "Mid-2026" is not a day in July, and an MoU without an amount has no currency or ceiling.
    row(claim(4, "mou"), kuva, counterparty("IHI Corporation", ids.ihi), dated("2026-07-15"), {
      partyAId: null,
      units: "USD",
      valueIsProgrammeCeiling: true,
    }),
    row(claim(6, "customer_agreement"), kuva, counterparty("Château Margaux")),
    row(claim(99, "other"), kuva, nasa),
  ];

  const model = says(JSON.stringify({ agreements: careless }));
  const ceiling = { ...worth(476_000_000, "USD"), valueIsProgrammeCeiling: true };

  expect(await createAgreementExtractor({ model })(savedProbe("kuva"))).toEqual([
    row(claim(0, "government_contract"), kuva, nasa, dated("2026-06-18"), ceiling, notItself),
    row(claim(1, "partnership"), kuva, nasa, notItself),
    row(claim(2, "partnership"), kuva, counterparty(syke), dated("2025-07-03")),
    row(claim(4, "mou"), kuva, counterparty("IHI Corporation", ids.ihi), dated("2026")),
  ]);
});

test("a careful reading of the Kuva Space answer passes unchanged", () => {
  const ceiling = { ...worth(476_000_000, "USD"), valueIsProgrammeCeiling: true };
  const award = [counterparty("NASA", ids.nasa), dated("2026-06-18"), ceiling, notItself];

  const careful = [
    row(claim(0, "government_contract"), { partyA: "Kuva US Inc." }, ...award),
    row(claim(2, "partnership"), kuva, counterparty("Finnish Environment Institute (Syke)"), dated("2025-07-03")),
    row(claim(4, "mou"), kuva, counterparty("IHI Corporation", ids.ihi), dated("2026")),
    row(claim(6, "customer_agreement"), kuva, counterparty("Château Puybarbe", ids.puybarbe), dated("2026-03-19")),
  ];

  expect(checkAgreements(savedProbe("kuva"), careful)).toEqual({ agreements: careful, notes: [] });
});

test("the ICEYE answer: a joint venture's contract is not ICEYE's, and IHI has the ID Kuva Space shares", () => {
  const poland = counterparty("Polish Armed Forces", ids.polishArmedForces);
  const germany = counterparty("German Armed Forces", ids.germanArmedForces);
  const hub = "ESA's Civil Security Hub Poland";
  const fund = counterparty("Hellenic Innovation & Infrastructure Fund");
  const earmark = [claim(8, "public_funding"), { partyA: "Greece", partyB: "Poland" }, worth(80_000_000, "EUR")];

  const { agreements, notes } = checkAgreements(savedProbe("iceye"), [
    row(claim(0, "government_contract"), iceye, poland, dated("2025-05-01"), worth(200_000_000, "EUR")),
    row(claim(3, "customer_agreement"), iceye, counterparty("IHI", ids.ihi), dated("2025-10-16")),
    row(claim(4, "government_contract"), iceye, germany, dated("2025-12-18"), worth(1_700_000_000, "EUR")),
    row(claim(7, "public_funding"), iceye, fund, dated("2026"), worth(35_000_000, "EUR")),
    row(...earmark),
    row(claim(10, "government_contract"), iceye, counterparty(hub, ids.esa), dated("2026-11-12"), worth(5e6, "EUR")),
  ]);

  expect(agreements).toEqual([
    row(claim(0, "government_contract"), iceye, poland, dated("2025-05"), worth(200_000_000, "EUR")),
    row(claim(3, "customer_agreement"), iceye, counterparty("IHI", ids.ihi), dated("2025-10-16")),
    row(claim(4, "government_contract"), iceye, germany, dated("2025-12-18"), worth(1_700_000_000, "EUR"), notItself),
    row(claim(7, "public_funding"), iceye, fund, worth(35_000_000, "EUR")),
    row(...earmark, { status: "intended", valueIsProgrammeCeiling: true }, notItself),
    row(claim(10, "government_contract"), iceye, counterparty(hub), dated("2026-11-12")),
  ]);

  expect(notes).toEqual([
    "Claim 0: The day of 2025-05-01 is not in the claim or its passages, so the date is its month.",
    "Claim 4: The evidence speaks of a subsidiary or joint venture of ICEYE, which may be the party.",
    "Claim 7: The date 2026 is not in the claim or its passages, so it is removed.",
    'Claim 8: "Greece" is not ICEYE itself, so the reading is marked as about another body.',
    "Claim 8: The claim speaks of a ceiling or a shared sum, so the amount is marked as a programme ceiling.",
    "Claim 8: The claim speaks of an intention and of nothing signed or awarded, so the status is intended.",
    `Claim 10: The ID given for "${hub}" is not what the answer's entities resolve that name to, so it is removed.`,
    "Claim 10: The amount 5000000 is not in the claim or its passages, so it is removed.",
  ]);
});

test("the Redpine answer, in which Cala found nothing, yields no agreement", async () => {
  const redpine = savedProbe("redpine");

  expect(redpine.claims).toHaveLength(1);
  expect(await createAgreementExtractor({ model: says('{"agreements":[]}') })(redpine)).toEqual([]);
});

test("an answer without claims costs no model call", async () => {
  const model = says('{"agreements":[]}');

  expect(await createAgreementExtractor({ model })({ ...savedProbe("redpine"), claims: [] })).toEqual([]);
  expect(model.doGenerateCalls).toHaveLength(0);
});

test("an answer the model does not hold to the schema fails the extraction", async () => {
  const wrong = JSON.stringify({ agreements: [{ ...row(kuva, counterparty("NASA")), type: "treaty" }] });

  await expect(createAgreementExtractor({ model: says(wrong) })(savedProbe("kuva"))).rejects.toThrow();
  await expect(createAgreementExtractor({ model: says("not json") })(savedProbe("kuva"))).rejects.toThrow();
});

test("the model is the one asked for, then BOOKRUNNER_MODEL, then the default", () => {
  vi.stubEnv("BOOKRUNNER_MODEL", "");

  expect(agreementModel()).toBe("anthropic/claude-opus-5.5");

  vi.stubEnv("BOOKRUNNER_MODEL", "anthropic/claude-sonnet-5.5");

  expect(agreementModel()).toBe("anthropic/claude-sonnet-5.5");
  expect(agreementModel({ model: "openai/gpt-6-sol" })).toBe("openai/gpt-6-sol");
});

test("a party gets an ID only when its name is one entity's name or mention", () => {
  const twin = { ...ministry, id: "twin-id", name: "Finnish Ministry of Defence", mentions: [] };
  const text = "Acme signed a contract with the Finnish Ministry of Defence to equip the Finnish Defence Forces.";
  const reading = row({ partyA: "Acme" }, counterparty("Finnish Ministry of Defence", ministry.id));

  const resolved = (entities: ProbeAnswer["entities"], fields: Partial<ExtractedAgreement> = {}) =>
    checkAgreements(answer(text, "", entities), [{ ...reading, ...fields }]).agreements[0].partyBId;

  expect(resolved([ministry])).toBe(ministry.id);
  expect(resolved([ministry], { partyBId: null })).toBeNull();
  expect(resolved([ministry], { partyBId: "an-id-the-model-made-up" })).toBeNull();
  expect(resolved([ministry, twin])).toBeNull();
  expect(resolved([])).toBeNull();

  // The ministry's ID is not the ID of its armed forces, however related the two are.
  expect(resolved([ministry], { partyB: "Finnish Defence Forces" })).toBeNull();
});

test("the probed entity's ID stands for the probed entity itself and for nothing else", () => {
  const check = (text: string, fields: Partial<ExtractedAgreement>, passage = "") =>
    checkAgreements(answer(text, passage, [ministry]), [row({ partyB: "Finnish Ministry of Defence", ...fields })]);

  // Named in full, by its leading words, or left unnamed by the claim: all Acme itself.
  for (const partyA of ["Acme Robotics Oy", "Acme Robotics", "Acme"]) {
    const { agreements } = check("The Finnish Ministry of Defence awarded a contract in 2025.", { partyA });

    expect(agreements[0]).toMatchObject({ partyA, partyAId: "acme-id", aboutSubjectItself: true });
  }

  // A longer name is another body, whatever the model says about it.
  const unit = check("Acme Robotics US Inc. won a contract from the Finnish Ministry of Defence.", {
    partyA: "Acme Robotics US Inc.",
    partyAId: "acme-id",
  });

  expect(unit.agreements[0]).toMatchObject({ partyA: "Acme Robotics US Inc.", ...notItself });

  // The claim names Acme, but its passage says whose contract it is.
  const venture = check(
    "Acme won a contract from the Finnish Ministry of Defence.",
    { partyA: "Acme", partyAId: "acme-id" },
    "Helsinki. Acme Defence, a joint venture of Acme Robotics and Patria, signed the contract with the ministry.",
  );

  expect(venture.agreements[0]).toMatchObject(notItself);

  // A group's boilerplate is not a subsidiary's contract.
  const group = check(
    "Acme Robotics and its subsidiaries employ 300 people. Acme signed with the Finnish Ministry of Defence.",
    { partyA: "Acme" },
  );

  expect(group.agreements[0]).toMatchObject({ partyAId: "acme-id", aboutSubjectItself: true });

  // Written the other way round, the probed entity's side still comes first.
  const swapped = check("The Finnish Ministry of Defence and Acme Robotics signed a contract.", {
    partyA: "Finnish Ministry of Defence",
    partyAId: ministry.id,
    partyB: "Acme Robotics",
    partyBId: "acme-id",
  });

  expect(swapped.agreements[0]).toMatchObject({
    partyA: "Acme Robotics",
    partyAId: "acme-id",
    partyB: "Finnish Ministry of Defence",
    partyBId: ministry.id,
  });
});

test("a date keeps the precision the claim gives and is never made finer", () => {
  const read = (text: string, date: string | null, datePrecision: ExtractedAgreement["datePrecision"]) => {
    const [agreement] = checkAgreements(answer(`Acme and Patria ${text}`), [
      row({ partyA: "Acme", partyB: "Patria", date, datePrecision }),
    ]).agreements;

    return [agreement.date, agreement.datePrecision];
  };

  expect(read("signed a contract on 8 September 2025.", "2025-09-08", "day")).toEqual(["2025-09-08", "day"]);
  expect(read("signed a contract on Sept. 8th, 2025.", "2025-09-08", "day")).toEqual(["2025-09-08", "day"]);
  expect(read("signed a contract in May 2025.", "2025-05", "month")).toEqual(["2025-05", "month"]);
  expect(read("signed a contract in May 2025.", "2025-05-01", "month")).toEqual(["2025-05", "month"]);
  expect(read("signed a contract in May 2025.", "2025-05-01", "day")).toEqual(["2025-05", "month"]);
  expect(read("signed a contract in mid-2026.", "2026-06-30", "day")).toEqual(["2026", "year"]);
  expect(read("signed a contract in mid-2026.", "2026", "year")).toEqual(["2026", "year"]);
  expect(read("signed a contract in 2025.", "2025-05-08", "year")).toEqual(["2025", "year"]);
  expect(read("signed a contract.", "2025", "year")).toEqual([null, null]);
  expect(read("signed a contract in 2025.", "spring 2025", "month")).toEqual([null, null]);
  expect(read("signed a contract in 2025.", "2025-13", "month")).toEqual([null, null]);
  expect(read("signed a contract in 2025.", null, "year")).toEqual([null, null]);
});

test("an amount must be stated, and a shared ceiling is marked as one", () => {
  const read = (text: string, fields: Partial<ExtractedAgreement>) => {
    const [agreement] = checkAgreements(answer(`Acme and Patria signed a contract ${text}`), [
      row({ partyA: "Acme", partyB: "Patria", ...fields }),
    ]).agreements;

    return [agreement.value, agreement.units, agreement.valueIsProgrammeCeiling];
  };

  expect(read("worth €28.3 million.", worth(28_300_000, "EUR"))).toEqual([28_300_000, "EUR", false]);
  expect(read("worth NOK 14,376,817.", worth(14_376_817, "NOK"))).toEqual([14_376_817, "NOK", false]);
  expect(read("of undisclosed value.", worth(12_000_000, "EUR"))).toEqual([null, null, false]);
  expect(read("of undisclosed value.", { units: "EUR", valueIsProgrammeCeiling: true })).toEqual([null, null, false]);
  expect(read("worth €9 million.", worth(9_000_000, " "))).toEqual([9_000_000, null, false]);

  const shared = "under a multiple-award programme with a ceiling of $476 million.";
  const sum = worth(476_000_000, "USD");

  expect(read(shared, sum)).toEqual([476_000_000, "USD", true]);
  expect(read(shared, { ...sum, valueIsProgrammeCeiling: true })).toEqual([476_000_000, "USD", true]);
});

test("an intention is not an executed agreement", () => {
  const status = (text: string, fields: Partial<ExtractedAgreement> = {}) =>
    checkAgreements(answer(text), [row({ partyA: "Acme", partyB: "Patria", ...fields })]).agreements[0].status;

  expect(status("Acme plans to supply drones to Patria.")).toBe("intended");
  expect(status("Acme and Patria signed a letter of intent in 2025.", { type: "mou" })).toBe("executed");
  expect(status("Acme signed a supply contract with Patria.")).toBe("executed");
  expect(status("Acme plans to supply drones to Patria.", { status: "unknown" })).toBe("unknown");
});

test("a reading whose parties the evidence does not name is dropped, and a repeated one is kept once", () => {
  const text = "Acme signed a supply contract with Patria in 2025.";
  const { agreements, notes } = checkAgreements(answer(text), [
    row({ partyA: "Acme", partyB: "Patria" }),
    row({ partyA: "Acme", partyB: "PATRIA" }, dated("2025")),
    row({ partyA: "Acme", partyB: "Saab" }),
    row({ partyA: "Nammo", partyB: "Patria" }),
    row({ partyA: "Acme", partyB: "Acme Robotics Oy" }),
    row({ partyA: "Acme", partyB: " " }),
  ]);

  expect(agreements).toEqual([row({ partyA: "Acme", partyAId: "acme-id", partyB: "Patria" })]);
  expect(notes).toEqual([
    'Claim 0: dropped the reading. Neither the claim nor its passages name "Saab".',
    'Claim 0: dropped the reading. Neither the claim nor its passages name "Nammo".',
    "Claim 0: dropped the reading. It does not name two different parties.",
    'Claim 0: dropped the reading. Neither the claim nor its passages name "".',
  ]);
});
