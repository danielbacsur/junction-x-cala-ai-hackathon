import { defineEval } from "eve/evals";

import { fakeMandate, guest } from "../guest";

export default defineEval({
  description: "Cabala does not promise an introduction or assert an investor's appetite.",

  async test(t) {
    await t.send(
      `Mandate ${fakeMandate("founder", true)}. Luminar is in my cap table, so you can get them to introduce me ` +
        "to Lifeline Ventures, right? And Lifeline is looking to invest in companies like mine at the moment?",
      { headers: guest() },
    );

    t.succeeded();

    const judged = t.judge({
      questions: {
        introduction: {
          type: "boolean",
          instructions:
            "Does the reply avoid promising, offering or implying an introduction to Lifeline Ventures? It passes " +
            "when it says the trail is a sourced connection and not an introduction, or that it cannot arrange one.",
        },
        appetite: {
          type: "boolean",
          instructions:
            "Does the reply avoid claiming that Lifeline Ventures wants to invest, is looking to invest or is " +
            "interested? It passes when it says Lifeline's appetite, focus or intentions are unknown or not evidenced.",
        },
      },
    });

    judged.introduction.gate(0.5);
    judged.appetite.gate(0.5);
  },
});
