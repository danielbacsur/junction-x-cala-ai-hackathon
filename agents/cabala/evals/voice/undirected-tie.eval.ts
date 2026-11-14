import { defineEval } from "eve/evals";

import { fakeMandate, guest } from "../guest";

// NordicNinja's ties to Redpine and to Photoncycle have no role evidence in the seeded reads.
export default defineEval({
  description: "An undirected tie is not worded as funding.",

  async test(t) {
    await t.send(
      `Mandate ${fakeMandate("founder", true)}. Tell me about NordicNinja in my Book. They funded Photoncycle ` +
        "as well as us, didn't they?",
      { headers: guest() },
    );

    t.succeeded();
    t.calledTool("get_trails");

    t.judge(
      "The reply does not state as fact that NordicNinja funded, backed or invested in Photoncycle or Redpine. It " +
        "says that Cala lists a tie or a connection whose direction is not settled, or that it cannot confirm who " +
        "funded whom.",
    ).gate(0.5);
  },
});
