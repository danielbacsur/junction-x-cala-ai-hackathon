import { connection } from "next/server";

import { formatClock, formatDate, formatStamp, plural } from "@/lib/format";
import { attempt } from "@/lib/ledger";
import { ago, isStale } from "@/lib/wording";

/** One read of the store's coverage at request time, with the clock it was read by. */
async function readCoverage() {
  await connection();

  const coverage = await attempt((ledger) => ledger.getCoverage());

  return { coverage, now: Date.now() };
}

/**
 * What the store holds right now, in actual counts, and whether Cala is answering. The roster is
 * a list Cala keeps; being on it says nothing about who will be in the room.
 */
export async function CoverageLine() {
  const { coverage, now } = await readCoverage();

  if (!coverage) {
    return (
      <p role="status" className="rounded-2xl bg-orange-tint px-4 py-3 text-sm text-ink">
        The ledger is not answering, so coverage cannot be shown. A mandate cannot be opened until it does.
      </p>
    );
  }

  const latched = coverage.cala === "latched";
  const stale = isStale(coverage.newestFetchAt, now);

  return (
    <div className="flex flex-col gap-3">
      {latched && (
        <p role="status" className="rounded-2xl bg-orange-tint px-4 py-3 text-sm text-ink">
          <strong className="font-demi">Cala is not answering.</strong> Showing stored evidence from{" "}
          {formatStamp(coverage.newestFetchAt) ?? "an unknown time"}. New reads are queued, and nothing is promised until it answers
          again.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-ink-3">Cala&rsquo;s Slush 2026 list</dt>
          <dd className="font-demi text-ink">{plural(coverage.rosterSize, "name")}</dd>
          <dd className="text-meta text-ink-3">snapshot of {formatDate(coverage.rosterFetchedAt?.slice(0, 10)) ?? "an unknown date"}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Read in full</dt>
          <dd className="font-demi text-ink">{plural(coverage.entitiesReadInFull, "entity", "entities")}</dd>
          <dd className="text-meta text-ink-3">{plural(coverage.hubsRead, "investor hub")} read</dd>
        </div>
        <div>
          <dt className="text-ink-3">Signal probes stored</dt>
          <dd className="font-demi text-ink">{coverage.probesStored}</dd>
          <dd className="text-meta text-ink-3">each 30 to 60 s when asked live</dd>
        </div>
        <div>
          <dt className="text-ink-3">Cala</dt>
          <dd className="font-demi text-ink">{latched ? "Not answering" : "Answering"}</dd>
          <dd className="text-meta text-ink-3">
            {coverage.calaCheckedAt ? `checked ${formatClock(coverage.calaCheckedAt)}, ${ago(coverage.calaCheckedAt, now)}` : "not checked yet"}
            {stale && !latched ? ". Stored evidence is stale" : ""}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function CoverageSkeleton() {
  return <div aria-hidden="true" className="h-16 animate-pulse rounded-2xl bg-wash motion-reduce:animate-none" />;
}
