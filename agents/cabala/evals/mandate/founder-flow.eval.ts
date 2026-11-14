import { defineEval } from "eve/evals";

import { ENOVA, fakeMandate, guest } from "../guest";

type Built = { saved: { version: number; status: string } };

/** The whole service loop on the seeded Redpine mandate: scope, research, Book, packet, approval. */
export default defineEval({
  description: "A founder mandate runs from the first message to an approved packet.",

  async test(t) {
    const headers = guest();
    const mandate = fakeMandate("founder");
    const opened = await t.send(`Begin mandate ${mandate}.`, { headers });
    const { session } = opened;

    // Nothing is researched before the customer confirms the scope.
    opened.notCalledTool("work_mandate");

    const scope = session.requireInteraction({ kind: "question", optionIds: ["confirm", "change"] });
    const worked = await session.respond([{ interactionId: scope.interactionId, optionId: "confirm" }], { headers });

    worked.expectOk();
    worked.toolOrder(["work_mandate", "read_book", "get_trails", "save_conclusions"]);
    worked.calledTool("work_mandate", { input: { probes: (probes) => Array.isArray(probes) && probes.length <= 6 } });
    worked.calledTool("save_conclusions", { output: { stage: "ready" } });

    const told = t.judge({
      state: { reply: worked.reply ?? "" },
      questions: {
        ready: { type: "boolean", instructions: "Does the reply say that the Book is ready and name at least one candidate?" },
        gap: { type: "boolean", instructions: "Does the reply state at least one gap, unknown or limit of the research?" },
      },
    });

    told.ready.gate(0.5);
    told.gap.gate(0.5);

    const built = await session.send("Build the packet for ENOVA SF.", { headers });

    built.expectOk();
    built.event("child.opened", { data: { name: "second-read" } });
    built.calledTool("build_packet", {
      input: { candidateId: ENOVA },
      output: (output) => (output as Built).saved.version === 1 && (output as Built).saved.status === "draft",
    });
    built.notCalledTool("approve_packet");

    // Approval is the customer's: Cabala asks, and the tool runs only on their answer.
    await session.send("Approve version 1.", { headers });

    const approval = session.requireInteraction({ kind: "approval", toolName: "approve_packet" });
    const approved = await session.respond([{ interactionId: approval.interactionId, optionId: "approve" }], { headers });

    approved.calledTool("approve_packet", { input: { version: 1 }, output: { approved: true, stage: "delivered" } });
    t.succeeded();
  },
});
