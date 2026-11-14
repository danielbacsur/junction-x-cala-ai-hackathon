import { CalaUnavailableError } from "@fundraising/package-ledger";

import { currentGuest } from "@/lib/guest";
import { getLedger } from "@/lib/ledger";

/** Name matches for the intake. It resolves who the customer is; it is not a search of the graph. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (!(await currentGuest())) return Response.json({ error: "Not found." }, { status: 404 });
  if (query.length < 2) return Response.json({ matches: [] });

  try {
    const matches = await getLedger().findEntity(query, { types: ["Company", "Organization"], limit: 8 });

    return Response.json({ matches }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CalaUnavailableError) return Response.json({ error: "cala_unavailable" }, { status: 503 });

    throw error;
  }
}
