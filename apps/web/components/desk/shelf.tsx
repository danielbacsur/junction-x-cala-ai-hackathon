import type { Book } from "@fundraising/package-ledger";
import Link from "next/link";

import { BRIEFS, type PacketSummary } from "@/lib/desk-types";
import { formatStamp, plural } from "@/lib/format";

const STATUS: Record<PacketSummary["status"], string> = { draft: "Draft", approved: "Approved", superseded: "Superseded" };

/** The deliverable shelf: the list, the briefs and every packet version, with where each stands. */
export function Shelf({ book, packets }: { book: Book; packets: PacketSummary[] }) {
  const { id, revision } = book.mandate;
  const briefs = book.rows.filter((row) => row.hasBrief).length;

  return (
    <section aria-labelledby="shelf-title" className="rounded-card bg-card p-5 shadow-hairline">
      <h2 id="shelf-title" className="text-heading">
        Deliverables
      </h2>

      <ul className="mt-3 grid gap-2.5 text-sm">
        <li className="flex items-baseline justify-between gap-3">
          <span>The list</span>
          <span className="text-ink-2">
            {plural(book.rows.length, "row")}, revision {revision}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-3">
          <span>Briefs</span>
          <span className="text-ink-2">
            {briefs} of {BRIEFS}
          </span>
        </li>
      </ul>

      <h3 className="mt-4 border-t border-line pt-4 text-sm font-demi">Meeting packets</h3>
      {packets.length === 0 ? (
        <p className="mt-1.5 text-sm text-ink-2">None yet. Cabala builds one for a briefed candidate when you ask.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {packets.toReversed().map((packet) => (
            <li key={packet.version}>
              <Link
                href={`/m/${id}/packet/${packet.version}`}
                className="block rounded-xl bg-paper/60 px-3 py-2.5 text-sm shadow-hairline transition-shadow duration-150 hover:shadow-lift"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    Version {packet.version}: {packet.candidate.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${
                      packet.status === "approved" ? "bg-ink text-card" : packet.status === "draft" ? "bg-yellow-tint" : "text-ink-3 outline outline-1 -outline-offset-1 outline-ink/25"
                    }`}
                  >
                    {STATUS[packet.status]}
                  </span>
                </span>
                <span className="mt-0.5 block text-[0.6875rem] text-ink-3">
                  {packet.approvedAt ? `Approved ${formatStamp(packet.approvedAt)}` : `Saved ${formatStamp(packet.createdAt)}`}
                  {packet.withheld > 0 ? `, ${plural(packet.withheld, "claim")} withheld` : ""}
                  {packet.basedOnRevision < revision ? ". Built on older criteria" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
