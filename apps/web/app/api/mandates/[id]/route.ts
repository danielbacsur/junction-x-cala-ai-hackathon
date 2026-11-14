import { currentGuest } from "@/lib/guest";
import { loadDesk } from "@/lib/desk";

/** The Desk polls this while a mandate is being worked. Another guest's mandate is a 404. */
export async function GET(_request: Request, { params }: RouteContext<"/api/mandates/[id]">) {
  const { id } = await params;
  const guest = await currentGuest();
  const snapshot = guest ? await loadDesk(id, guest) : null;

  if (!snapshot) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json(snapshot, { headers: { "cache-control": "private, no-store" } });
}
