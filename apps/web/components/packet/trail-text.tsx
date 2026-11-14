import type { Trail } from "@fundraising/package-ledger";

import { SourceList } from "@/components/ui/sources";
import { PATTERN, hopSentence, signalAmount, signalDate } from "@/lib/wording";

/**
 * A packet's trails as typed text, one hop per line with its sources, so the path survives print
 * and export. An undirected tie is written as a tie, and a derived hop quotes the claim it rests on.
 */
export function TrailText({ trails }: { trails: readonly Trail[] }) {
  if (trails.length === 0) {
    return <p className="text-sm text-ink-2">No trail is frozen with this version: the candidate is a direct fit only.</p>;
  }

  return (
    <div className="grid gap-4">
      {trails.map((trail) => (
        <div key={trail.id} className="rounded-2xl bg-paper/60 px-4 py-3.5 text-sm" data-print="plain">
          <p className="text-meta font-medium text-ink-3">
            {PATTERN[trail.pattern]}, {trail.hopCount} {trail.hopCount === 1 ? "hop" : "hops"}, frozen with this version
          </p>
          <ol className="mt-2 grid gap-3">
            {trail.hops.map((hop, index) => (
              <li key={`${hop.from.id}:${hop.to.id}:${index}`}>
                <p>
                  <span className="font-medium">Hop {index + 1}.</span> {hopSentence(hop)}
                  {hop.role ? ` ${hop.role}.` : ""}
                </p>
                {hop.claim && <blockquote className="mt-1 border-l-2 border-ink/30 pl-3 text-ink-2">{hop.claim}</blockquote>}
                <details className="mt-1.5 print:hidden">
                  <summary className="w-fit rounded-sm text-[0.6875rem] font-medium text-ink-2">
                    {hop.sources.length === 1 ? "1 source" : `${hop.sources.length} sources`}
                  </summary>
                  <div className="mt-2">
                    <SourceList sources={hop.sources} />
                  </div>
                </details>
                <ul className="mt-1 hidden list-disc pl-5 text-[9pt] print:block">
                  {hop.sources.map((source, at) => (
                    <li key={`${source.url}:${at}`}>
                      {[source.name, source.date, source.rank].filter(Boolean).join(", ")}
                      {source.url ? `: ${source.url}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          {trail.signal && (
            <p className="mt-3 border-t border-line pt-3">
              <span className="font-medium">Signal.</span> {trail.signal.label}: {signalAmount(trail.signal)}, {signalDate(trail.signal)}.
              {trail.signal.flag ? ` Flagged: ${trail.signal.flag}` : ""}
            </p>
          )}

          {trail.conclusion && (
            <p className="mt-2 text-ink-2">
              <span className="font-medium text-ink">Does not prove.</span> {trail.conclusion.doesNotProve}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
