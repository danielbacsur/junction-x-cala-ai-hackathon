"use client";

import type { Book, BookRow, CandidateCategory } from "@fundraising/package-ledger";
import { useState } from "react";

import { plural } from "@/lib/format";
import { CATEGORY, ENRICHMENT, PATTERN, beingWorked } from "@/lib/wording";

const ORDER: CandidateCategory[] = ["lead", "follow_up", "non_dilutive", "direct_fit"];

const CATEGORY_LOOK: Record<CandidateCategory, string> = {
  lead: "bg-blue-tint",
  follow_up: "bg-lilac-tint",
  non_dilutive: "bg-yellow-tint",
  direct_fit: "outline outline-1 -outline-offset-1 outline-dotted outline-ink/50",
};

/** How much of a candidate has been read, as a mark that does not rest on colour. */
function Enrichment({ status }: { status: BookRow["enrichment"] }) {
  const { label, hint } = ENRICHMENT[status];

  return (
    <span title={hint} className="inline-flex items-center gap-1 text-[0.6875rem] font-medium whitespace-nowrap text-ink-2">
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="3.9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={status === "queued" ? "1.6 1.6" : undefined} />
        {status === "read_in_full" && <circle cx="5" cy="5" r="2.4" fill="currentColor" />}
        {status === "seen_in_list" && <path d="M5 2.6a2.4 2.4 0 0 0 0 4.8Z" fill="currentColor" />}
      </svg>
      {label}
    </span>
  );
}

/** What stands in the list's place while it has no rows, in the words that fit the stage. */
function Empty({ book }: { book: Book }) {
  const { stage, subject } = book.mandate;
  const queued = book.coverage.cala === "latched";

  return (
    <div className="rounded-card bg-card px-5 py-8 text-center shadow-hairline">
      <p className="font-demi tracking-tight">Nothing in the list yet.</p>
      <p className="mx-auto mt-1.5 max-w-[42ch] text-sm text-ink-2">
        {stage === "brief_received" && "Cabala starts once the scope is confirmed. Rows appear here as trails are found."}
        {stage !== "brief_received" &&
          beingWorked(stage) &&
          (queued
            ? `Cala is not answering, and nothing around ${subject.name} is stored. The reads are queued; this stays empty until they are answered.`
            : `Nothing around ${subject.name} has been read yet. Rows appear as trails are found, and unread names are never ranked.`)}
        {!beingWorked(stage) && `The research found nobody it could rank for ${subject.name}. The gap report says what is missing.`}
      </p>
    </div>
  );
}

/**
 * The ranked Book. Every row says what kind of candidate it is, how it connects, and how much of
 * it has actually been read; a row with no demonstrated connection says "direct fit only".
 */
export function BookPanel({ book, selectedId, onSelect }: { book: Book; selectedId: string | null; onSelect: (candidateId: string) => void }) {
  const [filter, setFilter] = useState<CandidateCategory | null>(null);

  const { rows } = book;
  const present = ORDER.filter((category) => rows.some((row) => row.category === category));
  const shown = filter && present.includes(filter) ? rows.filter((row) => row.category === filter) : rows;

  const counts = (["read_in_full", "seen_in_list", "queued"] as const)
    .map((status) => [status, rows.filter((row) => row.enrichment === status).length] as const)
    .filter(([, count]) => count > 0);

  return (
    <section aria-labelledby="book-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="book-title" className="text-heading">
          The list
        </h2>
        <p className="text-meta text-ink-3">
          {plural(rows.length, "row")}, revision {book.mandate.revision}
        </p>
      </div>

      {rows.length > 0 && (
        <p className="mt-1 text-meta text-ink-3">
          Coverage: {counts.map(([status, count]) => `${count} ${ENRICHMENT[status].label.toLowerCase()}`).join(", ")}. Only what was read is
          ranked.
        </p>
      )}

      {present.length > 1 && (
        <div role="group" aria-label="Show one kind of candidate" className="mt-3 flex flex-wrap gap-1.5">
          {[null, ...present].map((category) => (
            <button
              key={category ?? "all"}
              type="button"
              aria-pressed={filter === category}
              onClick={() => setFilter(category)}
              className="h-7 rounded-full px-2.5 text-xs font-medium text-ink-2 shadow-hairline transition-colors duration-150 hover:text-ink aria-pressed:bg-ink aria-pressed:text-card"
            >
              {category ? CATEGORY[category].label : "All"}{" "}
              <span className="tabular-nums opacity-70">{category ? rows.filter((row) => row.category === category).length : rows.length}</span>
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-4">
          <Empty book={book} />
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-2">
          {shown.map((row) => {
            const selected = row.candidate.id === selectedId;

            return (
              <li key={row.id} className="animate-rise">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(row.candidate.id)}
                  className="group w-full rounded-card bg-card px-4 py-3.5 text-left shadow-hairline transition-shadow duration-150 hover:shadow-lift aria-pressed:shadow-[0_0_0_2px_var(--color-ink)]"
                >
                  <span className="flex items-start gap-3">
                    <span aria-hidden="true" className="w-5 shrink-0 pt-0.5 text-sm font-demi text-ink-3 tabular-nums">
                      {row.rank}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-demi tracking-tight [overflow-wrap:anywhere]">
                          <span className="sr-only">Rank {row.rank}: </span>
                          {row.candidate.name}
                        </span>
                        <span
                          title={CATEGORY[row.category].hint}
                          className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap ${CATEGORY_LOOK[row.category]}`}
                        >
                          {CATEGORY[row.category].label}
                        </span>
                        {row.hasBrief && <span className="rounded-full bg-ink px-2 py-0.5 text-[0.6875rem] font-medium text-card">Brief</span>}
                      </span>

                      <span className="mt-1 line-clamp-3 text-sm text-ink-2">{row.reason}</span>

                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] font-medium text-ink-2">
                        {row.bestTrail ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden="true" className="size-2 rounded-full bg-blue" />
                            {PATTERN[row.bestTrail.pattern]}, {row.bestTrail.hopCount} {row.bestTrail.hopCount === 1 ? "hop" : "hops"}
                            {row.trailIds.length > 1 ? `, ${row.trailIds.length} trails` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden="true" className="size-2 rounded-full outline outline-1 outline-dotted outline-ink/60" />
                            {row.directFitOnly ? "Direct fit only: no connection demonstrated" : "No trail yet"}
                          </span>
                        )}
                        {row.bestTrail?.signalLabel && (
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden="true" className="size-2 rounded-full bg-yellow" />
                            {row.bestTrail.signalLabel}
                          </span>
                        )}
                        <Enrichment status={row.enrichment} />
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
