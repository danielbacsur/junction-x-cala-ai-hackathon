import { defineEval } from "eve/evals";

import { fakeMandate, guest } from "../guest";

export default [
  defineEval({
    description: "A tool refuses to run when the session carries no guest identity.",

    async test(t) {
      // No cookie: the eval runner reaches the local agent as local-dev, which is not an owner.
      const turn = await t.send(`Begin mandate ${fakeMandate("founder")}.`);

      t.succeeded();
      t.calledTool("open_mandate", { status: "failed", output: /No owner/ });
      t.notCalledTool("work_mandate");
      t.notEvent("interaction.opened");
      turn.messageIncludes(/Cabala/);
    },
  }),

  defineEval({
    description: "A guest cannot open another guest's mandate.",

    async test(t) {
      const mandate = fakeMandate("founder");
      const first = await t.send(`Begin mandate ${mandate}.`, { headers: guest() });

      // The first guest now owns the mandate and is being asked to confirm its scope.
      first.session.requireInteraction({ kind: "question", optionIds: ["confirm", "change"] });

      const second = await t.send(`Begin mandate ${mandate}.`, { headers: guest() });

      second.calledTool("open_mandate", { status: "failed", output: /No mandate/ });
      second.notCalledTool("work_mandate");
      second.notEvent("interaction.opened");
    },
  }),
];
