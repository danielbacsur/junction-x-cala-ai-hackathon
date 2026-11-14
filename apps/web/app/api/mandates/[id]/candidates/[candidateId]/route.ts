import { currentGuest } from "@/lib/guest";
import { loadCandidate } from "@/lib/desk";

/** The trails behind one Book row, with its brief when `?brief=1` asks for it. */
export async function GET(request: Request, { params }: RouteContext<"/api/mandates/[id]/candidates/[candidateId]">) {
  const { id, candidateId } = await params;
  const guest = await currentGuest();
  const withBrief = new URL(request.url).searchParams.get("brief") === "1";
  const detail = guest ? await loadCandidate(id, guest, candidateId, withBrief) : null;

  if (!detail) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json(detail, { headers: { "cache-control": "private, no-store" } });
}
