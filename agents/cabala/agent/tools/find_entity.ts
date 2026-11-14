import { defineTool } from "eve/tools";
import { z } from "zod";

import { getLedger } from "@/agent/lib/ledger";
import { ownerOf } from "@/agent/lib/owner";

export default defineTool({
  description:
    "Find a company, fund, organization or person in Cala by name. Returns candidates with their Cala IDs, " +
    "whether each one is already read in full, and whether Cala lists it as a Slush 2026 attendee.",

  inputSchema: z.object({
    name: z.string().min(1).describe("The name to look for, as the customer wrote it."),
    types: z
      .array(z.string())
      .optional()
      .describe("Cala entity types to keep, such as Company, Organization or Person."),
  }),

  availableInSubagents: false,

  label: { start: ({ name }) => `Look up ${name}` },

  async execute({ name, types }, ctx) {
    ownerOf(ctx.session);

    return { matches: await getLedger().findEntity(name, { types, limit: 8 }) };
  },
});
