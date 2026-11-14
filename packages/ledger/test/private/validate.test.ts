import { describe, expect, test } from "vitest";

import type { EntityRef, Mandate } from "../../src/contract";
import { buildBundle } from "../../src/private/bundle";
import { validateSections } from "../../src/private/validate";
import { iceye, kuvaBrief, openConstraints, redpine, redpineBrief, sections } from "./fixtures";

function mandate(subject: EntityRef, notes: string | null = null): Mandate {
  return {
    id: "mandate",
    ownerId: "guest",
    role: "founder",
    subject,
    constraints: { ...openConstraints, notes },
    revision: 1,
    stage: "researching",
    sessionId: null,
    createdAt: "2026-11-14T12:00:00.000Z",
    updatedAt: "2026-11-14T12:00:00.000Z",
  };
}

const redpineBundle = buildBundle(mandate(redpine), redpineBrief("mandate", 1));
const kuvaBundle = buildBundle(mandate(iceye), kuvaBrief("mandate", 1));

/** Checks one sentence as prose and returns why it was withheld, or null when it stands. */
function reason(bundle: typeof redpineBundle, sentence: string): string | null {
  const result = validateSections(bundle, sections({ whyMeet: sentence }));

  expect(result.ok).toBe(result.withheld.length === 0);
  expect(result.sections.whyMeet).toBe(result.ok ? sentence : "");

  return result.withheld[0]?.reason ?? null;
}

describe("supported sentences stand", () => {
  test.each([
    "Luminar Ventures funded Redpine Technology AB.",
    "Luminar Ventures invested in both Redpine and Photoncycle.",
    "Redpine's backer Luminar Ventures also backs Photoncycle.",
    "Photoncycle is backed by Luminar Ventures.",
    "ENOVA SF gave Photoncycle AS a grant of NOK 14,376,817, with an event date of 13 March 2025.",
    "Photoncycle received NOK 14.4 million from ENOVA SF in March 2025.",
    "Photoncycle's grant from Innovation Norway was NOK 5,300,000.",
    "Photoncycle has received public money twice: NOK 14,376,817 from ENOVA SF and NOK 5,300,000 from Innovation Norway.",
    "Luminar Ventures, which backs Photoncycle, also funded Redpine.",
    "Photoncycle holds two grants.",
    "The register entry for the ENOVA grant was reported on 2025-06-19.",
    "NordicNinja VC and Redpine have an investment tie, and the direction is not settled.",
    "Redpine is connected to Photoncycle through NordicNinja VC.",
    "Redpine and Photoncycle share a backer in Luminar Ventures.",
    "The stage wanted is Seed.",
    "It backs Photoncycle.",
    "Both funded Photoncycle.",
    "Grants funded Photoncycle's pilot.",
    "Redpine is a Seed-stage company, and Luminar Ventures funded its Series A.",
  ])("%s", (sentence) => {
    expect(reason(redpineBundle, sentence)).toBeNull();
  });

  test.each([
    "Kuva Space signed a memorandum of understanding with IHI Corporation.",
    "ICEYE and IHI Corporation signed a memorandum of understanding on 22 May 2025.",
    "ICEYE and Kuva Space both have an agreement with IHI Corporation.",
    "Kuva US Inc. is an awardee under NASA's CSDA On-Ramp 2 programme, whose ceiling of $476 million is shared across all awardees.",
  ])("%s", (sentence) => {
    expect(reason(kuvaBundle, sentence)).toBeNull();
  });
});

describe("the programme ceiling awarded to a subsidiary", () => {
  test("is not Kuva Space's contract value", () => {
    const why = reason(kuvaBundle, "Kuva Space won a $476 million NASA contract.");

    expect(why).toContain("ceiling of a whole programme");
    expect(why).toContain("does not show an award or funding between Kuva Space and NASA");
    expect(why).toContain("NASA with Kuva US Inc.");
  });

  test("is not the subsidiary's contract value either", () => {
    expect(reason(kuvaBundle, "Kuva US Inc. won a $476 million contract from NASA.")).toContain("ceiling");
  });

  test("cannot be taken for granted in a question", () => {
    expect(reason(kuvaBundle, "How will Kuva Space deliver its $476 million NASA contract?")).toContain("ceiling");
    expect(reason(kuvaBundle, "Is the $476 million a ceiling shared by all awardees?")).toBeNull();
    expect(reason(kuvaBundle, "Would a $2 million pilot be a sensible first step?")).toBeNull();
  });

  test("cannot be moved to the parent without the amount", () => {
    expect(reason(kuvaBundle, "Kuva Space has a contract with NASA.")).toContain("NASA with Kuva US Inc.");
    expect(reason(kuvaBundle, "NASA selected Kuva Space for its CSDA programme.")).toContain("Kuva US Inc.");
    expect(reason(kuvaBundle, "The NASA award to Kuva Space has a ceiling of $476 million.")).toContain("Kuva US Inc.");
  });
});

describe("an undirected tie is not funding", () => {
  test.each([
    "NordicNinja VC invested in Redpine.",
    "Redpine is backed by NordicNinja VC.",
    "Redpine's investors include Luminar Ventures and NordicNinja VC.",
    "Luminar Ventures invested in Redpine alongside NordicNinja VC.",
    "The backers of Photoncycle are Luminar Ventures and NordicNinja VC.",
    "NordicNinja VC's investment in Photoncycle is the link.",
  ])("%s", (sentence) => {
    expect(reason(redpineBundle, sentence)).toContain("without settling who funded whom");
  });

  test("a settled tie cannot be reversed", () => {
    expect(reason(redpineBundle, "Redpine invested in Luminar Ventures.")).toContain("running the other way");
  });

  test("a round's lead needs evidence of its own", () => {
    expect(reason(redpineBundle, "Luminar Ventures led Redpine's seed round.")).toContain("who led a round");
  });

  test("two entities the evidence does not link are not funding either", () => {
    expect(reason(kuvaBundle, "IHI Corporation invested in Kuva Space.")).toContain("does not show funding between");
    expect(reason(kuvaBundle, "Kuva Space is a subsidiary of IHI Corporation.")).toContain("ownership relation");
    expect(reason(kuvaBundle, "Kuva Space's customers include NASA.")).toContain("does not show an agreement");
    expect(reason(redpineBundle, "ENOVA SF funded Redpine.")).toContain("does not show funding between");
    expect(reason(kuvaBundle, "ICEYE and Kuva Space are partners.")).toContain("does not show an agreement");
  });
});

describe("amounts, units, dates, counts and names must match", () => {
  test.each([
    ["ENOVA SF gave Photoncycle a grant of NOK 41,376,817.", "does not match any amount"],
    ["ENOVA SF gave Photoncycle a grant of about NOK 15 million.", "does not match any amount"],
    ["ENOVA SF gave Photoncycle a grant of $14,376,817.", "in NOK, not in USD"],
    ["ENOVA SF gave Photoncycle NOK 14,376,817 on 14 March 2025.", "The date 14 March 2025 does not match"],
    ["ENOVA SF gave Photoncycle NOK 14,376,817 in 2024.", "The date 2024 does not match"],
    ["ENOVA SF gave Photoncycle NOK 5,300,000 on 13 March 2025.", "in the same fact"],
    ["Photoncycle raised NOK 14,376,817 from Innovation Norway.", "not for Innovation Norway"],
    ["Innovation Norway granted Photoncycle NOK 14,376,817.", "not for Innovation Norway"],
    ["Redpine received NOK 14,376,817.", "not for Redpine Technology AB"],
    ["ENOVA SF gave Photoncycle its grant on 19 June 2025.", "the date of a source"],
    ["Photoncycle holds seven grants.", "The count seven does not match"],
    ["Sequoia Capital also backs Photoncycle.", 'Names "Sequoia Capital"'],
    ["Sequoia also backs Photoncycle.", 'Names "Sequoia"'],
    ["Atomico is an investor in Photoncycle.", 'Names "Atomico"'],
    ["Photoncycle is an Oslo-based company backed by Luminar Ventures.", 'Names "Oslo-based"'],
    ["The grant is listed at https://example.com/grants/1.", "not among the evidence's sources"],
    ["We are raising EUR 2 million.", "mandate's notes"],
  ])("%s", (sentence, expected) => {
    expect(reason(redpineBundle, sentence)).toContain(expected);
  });

  test("the customer's own figure stands once it is in the mandate's notes", () => {
    const bundle = buildBundle(mandate(redpine, "We are raising EUR 2 million."), redpineBrief("mandate", 1));

    expect(reason(bundle, "We are raising EUR 2 million.")).toBeNull();
  });

  test("a figure in what Cabala inferred does not support itself", () => {
    const brief = redpineBrief("mandate", 1);

    brief.trails[0].conclusion!.reading = "ENOVA SF could grant Redpine NOK 99 million.";

    expect(reason(buildBundle(mandate(redpine), brief), "ENOVA SF could grant Redpine NOK 99 million.")).toContain(
      "does not match any amount",
    );
  });
});

describe("what a packet may never say", () => {
  test.each([
    ["Luminar Ventures will introduce you to ENOVA SF.", "not an introduction"],
    ["Luminar Ventures can make a warm introduction to ENOVA SF.", "not an introduction"],
    ["You have an introduction through Luminar Ventures.", "not an introduction"],
    ["ENOVA SF has appetite for companies like Redpine.", "not proof of appetite"],
    ["ENOVA SF is looking to fund more hardware companies.", "not proof of appetite"],
    ["Luminar Ventures will invest in the next round.", "not proof of appetite"],
    ["Luminar Ventures will introduce Redpine to ENOVA SF.", "not an introduction"],
    ["The ENOVA grant led to Photoncycle's next round.", "not why"],
  ])("%s", (sentence, expected) => {
    expect(reason(redpineBundle, sentence)).toContain(expected);
  });
});

describe("what a packet may say without evidence", () => {
  test.each([
    "Would Luminar Ventures introduce us to ENOVA SF?",
    "Did NordicNinja VC invest in Redpine?",
    "Ask Luminar Ventures how Photoncycle obtained the ENOVA grant.",
    "Ask Luminar Ventures whether they would introduce you to ENOVA SF.",
    "This trail is a sourced connection, not an introduction.",
    "This suggests ENOVA SF may be open to companies beside Photoncycle.",
    "It does not prove that ENOVA SF has appetite for companies like Redpine.",
    "This does not show that NordicNinja VC funded Redpine.",
    "NordicNinja VC may have funded Redpine.",
    "Hi Anna,",
    "I'd like to introduce you to Redpine.",
    "We are keen to meet at Slush 2026.",
    "Redpine is looking to raise a seed round.",
    "Redpine would like to introduce you to its work.",
    "IHI Corporation, a counterparty of yours, also works with other satellite companies.",
    "I am [your name], and I would value twenty minutes of your time.",
  ])("%s", (sentence) => {
    expect(reason(redpineBundle, sentence)).toBeNull();
  });

  test("a hedge does not excuse a wrong figure or an introduction", () => {
    expect(reason(redpineBundle, "ENOVA SF may have given Photoncycle NOK 99 million.")).toContain("amount");
    expect(reason(redpineBundle, "Luminar Ventures could introduce you to ENOVA SF.")).toContain("introduction");
  });
});

describe("sections", () => {
  const draft = sections({
    whyMeet:
      "Luminar Ventures funded both Redpine and Photoncycle. NordicNinja VC invested in Redpine. Photoncycle holds two grants.",
    trail: "Redpine Technology AB - Luminar Ventures - Photoncycle AS.\n\nENOVA SF will introduce you to its programme team.",
    whyHesitate: "",
    questions: ["How did Photoncycle use the NOK 14,376,817?", "ENOVA SF gave Photoncycle NOK 99 million."],
    agenda: ["1. Introductions (5 min)", "Follow up with Anna by 1 December 2026", "Discuss Luminar's warm introduction"],
    outreachDraft: "Hi Anna,\n\nRedpine and Photoncycle share a backer in Luminar Ventures.\n\nBest,\n[your name]",
    privateNotes: "NordicNinja VC invested in Redpine. Do not share.",
  });

  const result = validateSections(redpineBundle, draft);

  test("unsupported sentences are removed and listed with a reason", () => {
    expect(result.ok).toBe(false);
    expect(result.sections.whyMeet).toBe("Luminar Ventures funded both Redpine and Photoncycle. Photoncycle holds two grants.");
    expect(result.sections.trail).toBe("Redpine Technology AB - Luminar Ventures - Photoncycle AS.");

    expect(result.withheld.map((claim) => claim.sentence)).toEqual([
      "NordicNinja VC invested in Redpine.",
      "ENOVA SF will introduce you to its programme team.",
      "ENOVA SF gave Photoncycle NOK 99 million.",
      "Discuss Luminar's warm introduction",
    ]);

    for (const claim of result.withheld) {
      expect(claim.by).toBe("validation");
      expect(claim.reason).not.toBe("");
    }
  });

  test("questions and agenda items may plan and ask", () => {
    expect(result.sections.questions).toEqual(["How did Photoncycle use the NOK 14,376,817?"]);
    expect(result.sections.agenda).toEqual(["1. Introductions (5 min)", "Follow up with Anna by 1 December 2026"]);
  });

  test("line breaks survive and private notes are left alone", () => {
    expect(result.sections.outreachDraft).toBe(draft.outreachDraft);
    expect(result.sections.privateNotes).toBe(draft.privateNotes);
  });

  test("checking the result again changes nothing", () => {
    const again = validateSections(redpineBundle, result.sections);

    expect(again.ok).toBe(true);
    expect(again.sections).toEqual(result.sections);
  });
});
