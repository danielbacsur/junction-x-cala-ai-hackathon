import { CalaUnavailableError, NotFoundError } from "@fundraising/package-ledger";

import { currentGuest } from "@/lib/guest";
import { getLedger } from "@/lib/ledger";

/** What the store holds on one entity: public evidence, shown in the drawer and in the intake. */
export async function GET(_request: Request, { params }: RouteContext<"/api/dossiers/[entityId]">) {
  const { entityId } = await params;

  if (!(await currentGuest())) return Response.json({ error: "Not found." }, { status: 404 });

  try {
    return Response.json(await getLedger().getDossier(entityId), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof NotFoundError) return Response.json({ error: "Not found." }, { status: 404 });
    if (error instanceof CalaUnavailableError) return Response.json({ error: "cala_unavailable" }, { status: 503 });

    throw error;
  }
}
