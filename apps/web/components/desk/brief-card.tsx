import type { Brief } from "@fundraising/package-ledger";
import type { ReactNode } from "react";

import type { OpenDrawer } from "@/components/desk/drawer-target";
import { SignalLine } from "@/components/desk/signal-line";
import { FitLines } from "@/components/desk/trail-view";
import { EvidenceTag } from "@/components/ui/evidence";
import { SourceList } from "@/components/ui/sources";
import { CATEGORY } from "@/lib/wording";

function Part({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="border-t border-line pt-4">
      <h4 className="flex flex-wrap items-center gap-2 text-sm font-demi">{title}</h4>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/**
 * One full brief: why meet, why hesitate, the candidate's own signals, what to ask, and what is
 * still unknown. Each line carries how it is known and opens its sources.
 */
export function BriefCard({
  brief,
  rank,
  selected,
  now,
  onOpen,
  onShowTrail,
  actions,
}: {
  brief: Brief;
  rank: number;
  selected: boolean;
  now: number;
  onOpen: OpenDrawer;
  onShowTrail: () => void;
  actions?: ReactNode;
}) {
  return (
    <details open className="group rounded-panel bg-card shadow-hairline">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-panel px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-meta font-medium text-ink-3">
            Brief, rank {rank}, {CATEGORY[brief.category].label.toLowerCase()}
          </span>
          <span className="block text-heading [overflow-wrap:anywhere]">{brief.candidate.name}</span>
        </span>
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full text-ink-2 transition-transform duration-200 group-open:rotate-180">
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
            <path d="M1 1.5 6 6.5l5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>

      <div className="grid gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
        <Part title="Why meet">
          <FitLines lines={brief.whyMeet} onOpen={onOpen} />
        </Part>

        <Part title="Why hesitate">
          <FitLines lines={brief.whyHesitate} onOpen={onOpen} />
        </Part>

        {brief.directSignals.length > 0 && (
          <Part title={`Its own signals`}>
            <div className="grid gap-2">
              {brief.directSignals.map((signal) => (
                <SignalLine key={signal.id} signal={signal} now={now} onOpen={onOpen} />
              ))}
            </div>
          </Part>
        )}

        {brief.ownership.length > 0 && (
          <Part title="Who owns it, from stored reads">
            <ul className="grid gap-3">
              {brief.ownership.map((owner) => (
                <li key={`${owner.relation}:${owner.entity.id}`} className="text-sm">
                  <button
                    type="button"
                    onClick={() => onOpen({ kind: "entity", entity: owner.entity })}
                    className="rounded-sm font-medium underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
                  >
                    {owner.entity.name}
                  </button>{" "}
                  <span className="text-ink-2">{owner.relation}</span>
                  <div className="mt-2 grid gap-2">
                    {owner.signals.map((signal) => (
                      <SignalLine key={signal.id} signal={signal} now={now} onOpen={onOpen} />
                    ))}
                    <SourceList sources={owner.sources} />
                  </div>
                </li>
              ))}
            </ul>
          </Part>
        )}

        <Part title="Questions to ask">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
            {brief.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </Part>

        {brief.stillUnknown.length > 0 && (
          <Part title={<EvidenceTag kind="unknown" />}>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-2">
              {brief.stillUnknown.map((unknown) => (
                <li key={unknown}>{unknown}</li>
              ))}
            </ul>
          </Part>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="max-w-[60ch] text-meta text-ink-3">Coverage: {brief.coverageNote}</p>
          <div className="flex flex-wrap items-center gap-2">
            {!selected && (
              <button
                type="button"
                onClick={onShowTrail}
                className="h-8 rounded-full px-3 text-sm font-medium text-ink-2 shadow-hairline hover:text-ink hover:shadow-lift"
              >
                Show its trail
              </button>
            )}
            {actions}
          </div>
        </div>
      </div>
    </details>
  );
}
