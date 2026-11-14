import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

import { ownerOf } from "@/agent/lib/owner";
import { checkAndSave } from "@/agent/lib/packet";
import { mandateId, sectionEdits } from "@/agent/lib/schemas";
import { loadBundle, loadPacket } from "@/agent/lib/steps";

export default defineWorkflowTool({
  description:
    "Save an edit to a packet as a new version. Pass the version being edited and only the sections that change, " +
    "each complete; the others are carried over. The customer's own wording goes in exactly as they gave it. The " +
    "edited packet goes through the same deterministic checks and second read as a new one, so a sentence the " +
    "evidence does not support is withheld whoever wrote it. The new version is a draft: an earlier approval does " +
    "not carry over.",

  inputSchema: z.object({
    mandateId,
    version: z.number().int().min(1).describe("The packet version being edited."),
    sections: sectionEdits.describe("The sections that change, each in full."),
  }),

  availableInSubagents: false,

  label: { start: ({ version }) => `Save an edit of packet version ${version}` },

  async execute({ mandateId, version, sections }, ctx) {
    "use workflow";

    const ownerId = ownerOf(ctx.session);
    const edited = await loadPacket(mandateId, ownerId, version);
    const bundle = await loadBundle(mandateId, ownerId, edited.candidate.id);
    const result = await checkAndSave(ctx, { mandateId, ownerId, bundle, sections: { ...edited.sections, ...sections } });

    return { editedVersion: version, ...result };
  },
});
