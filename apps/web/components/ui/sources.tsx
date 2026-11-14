import type { SourceRef } from "@fundraising/package-ledger";

import { formatDate } from "@/lib/format";

/** "eu-startups.com/2026/04/stockholms-redpine-…": enough of a URL to recognise where it leads. */
function readable(url: string) {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname === "/" ? "" : pathname.replace(/\/$/, "");

    return `${hostname.replace(/^www\./, "")}${path.length > 44 ? `${path.slice(0, 43)}…` : path}`;
  } catch {
    return url;
  }
}

/**
 * The documents behind a statement, as Cala cites them. A part Cala did not give stays missing
 * and is said to be missing: no publisher, date, rank or link is filled in.
 */
export function SourceList({ sources, empty = "No source is attached to this in the stored evidence." }: { sources: readonly SourceRef[]; empty?: string }) {
  if (sources.length === 0) return <p className="text-sm text-ink-2">{empty}</p>;

  return (
    <ul className="flex flex-col gap-2">
      {sources.map((source, index) => (
        <li key={`${source.url}:${index}`} className="rounded-xl bg-paper/60 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-ink">{source.name ?? "Unnamed source"}</span>
            {source.rank && (
              <span
                title="Cala's provenance label. It says where a document comes from, not how true it is."
                className="rounded-full bg-card px-1.5 py-0.5 font-mono text-[0.625rem] tracking-wide text-ink-2 shadow-hairline"
              >
                {source.rank}
              </span>
            )}
            <span className="text-ink-2">{formatDate(source.date) ?? "undated"}</span>
          </div>
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-block rounded-sm break-all text-ink-2 underline decoration-ink/30 underline-offset-2 hover:text-ink hover:decoration-ink"
            >
              {readable(source.url)}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <p className="mt-0.5 text-ink-2">No link given by Cala.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "3 sources", as a quiet button that opens them. */
export function SourceCount({ count, onOpen, label }: { count: number; onOpen: () => void; label: string }) {
  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${count} ${count === 1 ? "source" : "sources"} for: ${label}`}
      className="inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[0.6875rem] font-medium text-ink-2 underline decoration-ink/30 underline-offset-2 hover:text-ink hover:decoration-ink"
    >
      {count} {count === 1 ? "source" : "sources"}
    </button>
  );
}
