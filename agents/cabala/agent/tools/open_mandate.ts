import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

import { compactMandate, describeScope } from "@/agent/lib/compact";
import { ownerOf } from "@/agent/lib/owner";
import { constraints, mandateId } from "@/agent/lib/schemas";
import { confirmScope, loadMandate } from "@/agent/lib/steps";

export default defineWorkflowTool({
  description: "Open a mandate with its stored role and subject. Confirm complete briefs without asking the customer again. Infer explicit constraints from the notes and call work_mandate.",

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

    const confirmed = await confirmScope(mandateId, ownerId, constraints ?? null, ctx.callId);
    return { confirmed: true, mandate: compactMandate(confirmed), scope,
      next: "Infer structured constraints from constraints.notes, including known contacts as exclusions. Use set_constraints for explicit criteria. Leave unspecified criteria unknown. Then call work_mandate." };
  },
});
