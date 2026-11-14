import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

import { compactMandate, describeScope } from "@/agent/lib/compact";
import { ownerOf } from "@/agent/lib/owner";
import { constraints, mandateId } from "@/agent/lib/schemas";
import { confirmScope, loadMandate } from "@/agent/lib/steps";

/** A typed answer made of nothing but agreement, as opposed to one that asks for a change. */
const AGREES =
  /^(?:\s*(?:yes|yep|yeah|ok(?:ay)?|confirm(?:ed)?|correct|right|sure|fine|great|perfect|please|proceed|start|go ahead|go|do it|looks (?:good|right)|sounds good|that'?s (?:right|correct))[\s,.!]*)+$/i;

export default defineWorkflowTool({
  description:
    "Open a mandate: load it, restate its role, subject and constraints to the customer, and ask them to confirm " +
    "the scope. Call it first, with the mandate ID alone. When the customer answers with a correction, turn their " +
    "words into structured constraints and call it again with them; they are stored only once the customer " +
    "confirms. No research starts before the scope is confirmed.",

  inputSchema: z.object({
    mandateId,
    constraints: constraints
      .optional()
      .describe("The corrected scope, complete, after the customer asked for a change. Omit it on the first call."),
  }),

  availableInSubagents: false,

  label: { start: () => "Open the mandate" },

  async execute({ mandateId, constraints }, ctx) {
    "use workflow";

    const ownerId = ownerOf(ctx.session);
    const mandate = await loadMandate(mandateId, ownerId);
    const scope = describeScope(mandate, constraints ?? mandate.constraints);

    // A mandate already past its brief has a confirmed scope; reopening it only reads it back.
    if (!constraints && mandate.stage !== "brief_received") {
      return { confirmed: true, alreadyOpen: true, mandate: compactMandate(mandate), scope };
    }

    const answer = await ctx.ask({
      title: "Confirm the scope",
      prompt: scope,
      display: "confirmation",
      options: [
        { id: "confirm", label: "Confirm scope", style: "primary" },
        { id: "change", label: "Change something" },
      ],
      allowFreeform: true,
    });

    if (answer.status !== "answered") {
      return {
        confirmed: false,
        scope,
        reason:
          answer.status === "unavailable"
            ? "This session cannot ask the customer anything, so the scope stays unconfirmed."
            : "The question was withdrawn before the customer answered. Read their message, then ask again.",
      };
    }

    if (answer.optionId === "confirm" || (answer.text && AGREES.test(answer.text))) {
      const confirmed = await confirmScope(mandateId, ownerId, constraints ?? null, ctx.callId);

      return {
        confirmed: true,
        mandate: compactMandate(confirmed),
        next: "Call work_mandate with the mandate ID to see which neighbours the ledger proposes for a signal probe.",
      };
    }

    return {
      confirmed: false,
      scope,
      customerSaid: answer.text ?? null,
      next: answer.text
        ? "Turn what the customer said into complete constraints and call open_mandate again with them."
        : "Ask the customer what to change, then call open_mandate again with the corrected constraints.",
    };
  },
});
