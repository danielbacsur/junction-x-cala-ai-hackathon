import type { Statement } from "@fundraising/package-ledger";

/** The statement of work: what was actually done, counted, with nothing estimated. */
export function StatementOfWork({ statement }: { statement: Statement }) {
  const lines: [string, number, string][] = [
    ["Reads", statement.reads, "entity, hub and round reads"],
    ["Signal probes", statement.probes, "questions put to Cala's knowledge endpoint"],
    ["Served from the store", statement.servedFromStore, "answered without a request to Cala"],
    ["Trails found", statement.trailsFound, "sourced paths behind Book rows"],
    ["Sources cited", statement.sourcesCited, "distinct documents"],
    ["Claims withheld", statement.claimsWithheld, "sentences kept out of packets"],
  ];

  return (
    <section aria-labelledby="statement-title" className="rounded-card bg-card p-5 shadow-hairline">
      <h2 id="statement-title" className="text-heading">
        Statement of work
      </h2>
      <p className="mt-0.5 text-meta text-ink-3">Actual counts for this mandate, not estimates.</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
        {lines.map(([label, count, hint]) => (
          <div key={label}>
            <dt className="text-meta text-ink-3">{label}</dt>
            <dd className="text-xl font-demi tracking-tight tabular-nums" title={hint}>
              {count}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
