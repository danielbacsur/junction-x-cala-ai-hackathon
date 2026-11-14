import { NotFoundError } from "@fundraising/package-ledger";

import { currentGuest } from "@/lib/guest";
import { getLedger } from "@/lib/ledger";

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The packet as a Markdown file, as the ledger writes it: without the owner's private notes. */
export async function GET(_request: Request, { params }: RouteContext<"/m/[id]/packet/[version]/export">) {
  const { id, version } = await params;
  const guest = await currentGuest();
  const number = Number(version);

  if (!guest || !Number.isInteger(number)) return new Response("Not found.", { status: 404 });

  try {
    const ledger = getLedger();
    const [packet, markdown] = await Promise.all([ledger.getPacket(id, guest, number), ledger.exportPacket(id, guest, number)]);

    return new Response(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="packet-${slug(packet.candidate.name)}-v${packet.version}.md"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("Not found.", { status: 404 });

    throw error;
  }
}
