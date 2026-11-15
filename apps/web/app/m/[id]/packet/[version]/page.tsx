import { NotFoundError, type Packet } from "@fundraising/package-ledger";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Cabala } from "@/components/cabala/cabala";
import { PacketEditor } from "@/components/packet/packet-editor";
import { TrailText } from "@/components/packet/trail-text";
import { SiteHeader } from "@/components/ui/site-header";
import { formatStamp, plural } from "@/lib/format";
import { currentGuest } from "@/lib/guest";
import { getLedger } from "@/lib/ledger";

export const metadata: Metadata = { title: "Meeting packet" };

const STATUS: Record<Packet["status"], string> = { draft: "Draft", approved: "Approved", superseded: "Superseded" };
const BY: Record<Packet["withheld"][number]["by"], string> = { validation: "the checks", second_read: "the second read" };

/** One version of a meeting packet: read it, edit it into a new version, approve it, export it. */
export default function PacketPage(props: PageProps<"/m/[id]/packet/[version]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-page flex-1 px-4 pt-8 pb-24 sm:px-6 print:max-w-none print:p-0">
        <Suspense
          fallback={
            <p role="status" className="running-text w-fit text-sm">
              Opening the packet
            </p>
          }
        >
          <PacketLoader {...props} />
        </Suspense>
      </main>
    </>
  );
}

async function load(mandateId: string, version: number) {
  const guest = await currentGuest();

  if (!guest || !Number.isInteger(version)) return null;

  try {
    const ledger = getLedger();

    const [mandate, packet, packets] = await Promise.all([
      ledger.getMandate(mandateId, guest),
      ledger.getPacket(mandateId, guest, version),
      ledger.listPackets(mandateId, guest),
    ]);

    return { mandate, packet, packets };
  } catch (error) {
    if (error instanceof NotFoundError) return null;

    throw error;
  }
}

async function PacketLoader({ params, searchParams }: PageProps<"/m/[id]/packet/[version]">) {
  const [{ id, version }, query] = await Promise.all([params, searchParams]);
  const loaded = await load(id, Number(version));

  if (!loaded) notFound();

  const { mandate, packet, packets } = loaded;
  const newest = Math.max(...packets.map((candidate) => candidate.version));
  const stale = packet.basedOnRevision < mandate.revision;
  const justSaved = typeof query.saved === "string";

  return (
    <>
      <div data-print="hide" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href={`/m/${mandate.id}`} className="rounded-full text-ink-2 underline decoration-ink/25 underline-offset-2 hover:text-ink hover:decoration-ink">
          Back to the Desk
        </Link>
        <nav aria-label="Versions" className="flex flex-wrap items-center gap-1.5">
          {packets.map((candidate) => (
            <Link
              key={candidate.version}
              href={`/m/${mandate.id}/packet/${candidate.version}`}
              aria-current={candidate.version === packet.version ? "page" : undefined}
              className="flex h-7 items-center rounded-full px-2.5 text-xs font-medium text-ink-2 shadow-hairline hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-card"
            >
              Version {candidate.version}
              <span className="sr-only">, {STATUS[candidate.status]}</span>
            </Link>
          ))}
        </nav>
      </div>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-meta font-medium tracking-wide text-ink-3 uppercase">
            Meeting packet for {mandate.subject.name}, version {packet.version}, {STATUS[packet.status].toLowerCase()}
          </p>
          <h1 className="mt-1 text-title [overflow-wrap:anywhere]">{packet.candidate.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {packet.approvedAt ? `Approved ${formatStamp(packet.approvedAt)}.` : `Saved ${formatStamp(packet.createdAt)}.`} Prepared by Cabala,
            Cabala. Built with Cala.
          </p>
        </div>

        {packet.status === "approved" && (
          <div data-print="hide" className="flex items-center gap-3 rounded-card bg-card py-2 pr-5 pl-2 shadow-hairline">
            <Cabala state="done" size={72} />
            <p className="text-sm">
              <strong className="block font-demi">Delivered.</strong>
              <span className="text-ink-2">Version {packet.version} is yours to send.</span>
            </p>
          </div>
        )}
      </header>

      <div data-print="hide" className="mt-5 grid gap-3">
        {stale && (
          <p role="status" className="rounded-2xl bg-yellow-tint px-4 py-3 text-sm">
            <strong className="font-demi">Built on older criteria.</strong> This version rests on revision {packet.basedOnRevision} of the
            mandate, which is now at revision {mandate.revision}. Its evidence is unchanged; its ranking may not be.
          </p>
        )}

        {packet.version < newest && (
          <p role="status" className="rounded-2xl bg-yellow-tint px-4 py-3 text-sm">
            <strong className="font-demi">Not the newest version.</strong>{" "}
            <Link href={`/m/${mandate.id}/packet/${newest}`} className="font-medium underline underline-offset-2">
              Open version {newest}
            </Link>
          </p>
        )}

        {(packet.withheld.length > 0 || justSaved) && (
          <section
            aria-labelledby="withheld-title"
            className={`rounded-2xl px-4 py-3.5 text-sm ${packet.withheld.length > 0 ? "bg-orange-tint" : "bg-blue-tint"}`}
          >
            <h2 id="withheld-title" className="font-demi">
              {packet.withheld.length === 0
                ? `Saved as version ${packet.version}. Every sentence passed the checks.`
                : `${justSaved ? `Saved as version ${packet.version}. ` : ""}${plural(packet.withheld.length, "claim")} withheld from this packet`}
            </h2>
            {packet.withheld.length > 0 && (
              <>
                <p className="mt-0.5 text-ink-2">Each was taken out because the stored evidence cannot carry it. Nothing was reworded for you.</p>
                <ul className="mt-3 grid gap-3">
                  {packet.withheld.map((claim) => (
                    <li key={claim.sentence}>
                      <p className="font-medium">
                        <span aria-hidden="true">&ldquo;</span>
                        <s className="decoration-ink/50">{claim.sentence}</s>
                        <span aria-hidden="true">&rdquo;</span>
                      </p>
                      <p className="text-ink-2">
                        Withheld by {BY[claim.by]}. {claim.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </div>

      <div className="mt-6">
        <PacketEditor key={packet.id} packet={packet} latest={packet.version === newest} trail={<TrailText trails={packet.trails} />} />
      </div>

      <p className="mt-8 max-w-[70ch] text-meta text-ink-3">
        A trail is a sourced connection, not an introduction. A signal is a reason to ask, not proof of appetite. Claims marked as reported
        by Cala come from the documents Cala cites and are not verified by a filing.
      </p>
    </>
  );
}
