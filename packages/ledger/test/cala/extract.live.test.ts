import { expect, test } from "vitest";

import { agreementModel, checkAgreements, proposeAgreements } from "../../src/cala/extract";
import { probes, savedProbe } from "./probe";

/**
 * The real model on the three saved probe answers. It costs three model calls, so it runs only
 * when asked for, with the AI Gateway's credentials in the environment:
 *
 *   EXTRACT_LIVE=1 node --env-file=<path to .env.local> ../../node_modules/vitest/vitest.mjs run extract.live
 *
 * It prints what the model proposed and what the checks made of it, and holds the result to the
 * points a reading must never get wrong.
 */
const live = test.skipIf(process.env.EXTRACT_LIVE !== "1");

const IHI = "6d909137-a0a9-414c-bc93-40cbf5f6acd8";

async function read(name: keyof typeof probes) {
  const answer = savedProbe(name);
  const proposed = await proposeAgreements(answer, agreementModel());
  const checked = checkAgreements(answer, proposed);

  console.log(JSON.stringify({ probe: name, model: agreementModel(), proposed, ...checked }, null, 1));

  return { proposed, ...checked };
}

live("Kuva Space: the NASA award stays with the subsidiary, and the IHI memorandum is Kuva Space's own", async () => {
  const { proposed, agreements } = await read("kuva");
  const subject = probes.kuva.subject.id;

  // The model itself, before any check, keeps the subsidiary apart and marks the ceiling.
  for (const reading of [proposed, agreements]) {
    const award = reading.find((agreement) => agreement.partyB === "NASA" && agreement.value !== null);

    expect(award).toMatchObject({ value: 476_000_000, units: "USD", valueIsProgrammeCeiling: true });
    expect(award).toMatchObject({ aboutSubjectItself: false, partyAId: null });

    for (const agreement of reading.filter((one) => one.partyB === "NASA")) expect(agreement.partyAId).not.toBe(subject);
  }

  expect(agreements.find((agreement) => agreement.partyBId === IHI)).toMatchObject({
    claimIndex: 4,
    partyAId: subject,
    aboutSubjectItself: true,
    type: "mou",
    date: "2026",
    datePrecision: "year",
    value: null,
  });
}, 240_000);

live("ICEYE: the joint venture's contract is not ICEYE's, and both IHI agreements resolve", async () => {
  const { proposed, agreements } = await read("iceye");
  const subject = probes.iceye.subject.id;

  for (const reading of [proposed, agreements]) {
    const spock = reading.find((agreement) => agreement.claimIndex === 4);

    expect(spock).toMatchObject({ aboutSubjectItself: false, partyAId: null });
  }

  const withIhi = agreements.filter((agreement) => agreement.partyBId === IHI);

  expect(withIhi.map((agreement) => agreement.claimIndex)).toEqual([2, 3]);
  expect(withIhi.every((agreement) => agreement.partyAId === subject && agreement.aboutSubjectItself)).toBe(true);
  expect(withIhi[0]).toMatchObject({ type: "mou", date: "2025-05-22", datePrecision: "day" });
}, 240_000);

live("Redpine: an answer in which Cala found nothing yields no agreement", async () => {
  const { proposed, agreements } = await read("redpine");

  expect(proposed).toEqual([]);
  expect(agreements).toEqual([]);
}, 240_000);
