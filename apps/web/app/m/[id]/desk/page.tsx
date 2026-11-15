import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Desk } from "@/components/desk/desk";
import { SiteHeader } from "@/components/ui/site-header";
import { loadCandidate, loadDesk } from "@/lib/desk";
import { BRIEFS, detailKey, type CandidateDetail } from "@/lib/desk-types";
import { currentGuest } from "@/lib/guest";
import { attempt } from "@/lib/ledger";
import { observedFrom, type Observed } from "@/lib/scope";

export const metadata: Metadata = { title: "The Desk" };

/** The Desk of one mandate. It belongs to the guest who opened it; to anyone else it is a 404. */
export default function DeskPage({ params }: PageProps<"/m/[id]/desk">) {
  return (
    <Suspense fallback={<DeskSkeleton />}>
      <DeskLoader params={params} />
    </Suspense>
  );
}

async function DeskLoader({ params }: Pick<PageProps<"/m/[id]/desk">, "params">) {
  const { id } = await params;
  const guest = await currentGuest();
  const snapshot = guest ? await loadDesk(id, guest) : null;

  if (!guest || !snapshot) notFound();

  // The first paint already holds what the first screen shows: the top row's trails and the briefs.
  const { rows, mandate } = snapshot.book;
  const first = [...new Set([rows[0], ...rows.filter((row) => row.hasBrief).slice(0, BRIEFS)].filter((row) => row !== undefined))];

  const [details, observed] = await Promise.all([
    Promise.all(first.map(async (row) => [detailKey(row), await loadCandidate(id, guest, row.candidate.id, row.hasBrief)] as const)),
    // What Cala holds on the subject marks each criterion as Observed or Self-reported.
    attempt((ledger) => ledger.getDossier(mandate.subject.id)).then((dossier): Observed => (dossier ? observedFrom(dossier) : {})),
  ]);

  const initialDetails: Record<string, CandidateDetail> = {};

  for (const [key, detail] of details) if (detail) initialDetails[key] = detail;

  return <Desk initial={snapshot} initialDetails={initialDetails} observed={observed} />;
}

function DeskSkeleton() {
  return (
    <>
      <SiteHeader wide />
      <main className="mx-auto w-full max-w-[100rem] flex-1 px-4 pt-8 sm:px-6">
        <p role="status" className="running-text w-fit text-sm">
          Opening the Desk
        </p>
        <div aria-hidden="true" className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="h-96 animate-pulse rounded-panel bg-wash motion-reduce:animate-none" />
          <div className="h-64 animate-pulse rounded-card bg-wash motion-reduce:animate-none" />
        </div>
      </main>
    </>
  );
}
