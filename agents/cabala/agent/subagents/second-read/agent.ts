import { defineAgent } from "eve";

import { MODEL } from "@/agent/lib/model";

export default defineAgent({
  description: "Checks a packet draft against its evidence. Reached only from packet construction.",
  model: MODEL,
  reasoning: "medium",

  // No tools at all, and hidden from Cabala's own tool list: only a workflow can call it.
  defaultTools: false,
  tool: false,
});
