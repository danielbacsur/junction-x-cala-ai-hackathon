import { defineAgent } from "eve";

import { MODEL } from "@/agent/lib/model";

export default defineAgent({
  model: MODEL,
  reasoning: "medium",

  // Cabala works only through the typed tools in tools/: no shell, files or web, and no copies of
  // itself for the model to start. Packet construction still reaches a copy through ctx.agent.
  defaultTools: false,
  tool: false,
});
