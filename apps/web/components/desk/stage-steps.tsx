import type { MandateStage } from "@fundraising/package-ledger";

import { STAGES, STAGE_LABEL } from "@/lib/wording";

/**
 * Brief received, Researching, Challenging, Ready for your decision, Delivered: where the mandate
 * stands. On a phone only the current stage is spelled out; the others are dots in the same row.
 */
export function StageSteps({ stage }: { stage: MandateStage }) {
  const current = STAGES.indexOf(stage);

  return (
    <ol aria-label="Progress of the mandate" className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      {STAGES.map((step, index) => {
        const state = index < current ? "past" : index === current ? "current" : "ahead";

        return (
          <li key={step} className="flex items-center gap-1">
            {index > 0 && <span aria-hidden="true" className={`h-px w-3 sm:w-6 ${index <= current ? "bg-ink" : "bg-ink/25"}`} />}
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={`flex h-7 items-center gap-1.5 rounded-full whitespace-nowrap ${
                state === "current" ? "bg-ink px-2.5 font-medium text-card" : state === "past" ? "text-ink sm:px-2.5" : "text-ink-3 sm:px-2.5"
              }`}
            >
              {state === "past" && (
                <svg aria-hidden="true" width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1.5 5.8 4.3 8.5 9.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {state === "ahead" && <span aria-hidden="true" className="size-1.5 rounded-full bg-ink/30 sm:hidden" />}
              <span className={state === "current" ? undefined : "sr-only sm:not-sr-only"}>{STAGE_LABEL[step]}</span>
              {state === "past" && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
