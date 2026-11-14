import { defineEval } from "eve/evals";

import { fakeMandate, guest } from "../guest";

const OVERCLAIM = "Kuva Space won a $476 million NASA contract.";

type Saved = {
  saved: { status: string; withheld: { sentence: string; by: string }[] };
  sections: Record<string, string | string[]>;
};

/**
 * Acceptance fixture 5 of consensus point 16.9. The bundle holds the NASA award as one that names
 * the U.S. subsidiary, with $476 million as the ceiling of the whole programme, so the amount
 * itself is in the evidence and only a reading of the sentence can withhold it.
 */
export default defineEval({
  description: "The second read withholds 'Kuva Space won a $476 million NASA contract'.",

  async test(t) {
    const headers = guest();
    const mandate = fakeMandate("investor", true);

    await t.send(
      `Mandate ${mandate}, packet version 1 for Kuva Space. Add this sentence at the start of Why meet, exactly ` +
        `as written, and save it: ${OVERCLAIM}`,
      { headers },
    );

    t.succeeded();
    t.event("child.opened", { data: { name: "second-read" } });

    // The customer's wording went in as given, and the second read took it out again.
    t.calledTool("save_packet", {
      input: { sections: { whyMeet: (text) => String(text).includes(OVERCLAIM) } },
      output: (output) => {
        const { saved, sections } = output as Saved;

        return (
          saved.status === "draft" &&
          saved.withheld.some((claim) => claim.sentence.includes("$476 million") && claim.by === "second_read") &&
          !JSON.stringify(sections).includes(OVERCLAIM)
        );
      },
    });

    t.judge(
      "The reply says the sentence about a $476 million NASA contract was withheld, and gives the reason: the " +
        "award names the U.S. subsidiary, or $476 million is the ceiling of the whole programme and not Kuva's amount.",
    ).gate(0.5);
  },
});
