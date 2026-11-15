import type { Signal } from "@fundraising/package-ledger";

import type { OpenDrawer } from "@/components/desk/drawer-target";
import { SIGNAL_LABEL, WINDOW_MONTHS, outsideWindow, signalAmount, signalDate } from "@/lib/wording";

/** One dated fact, with which date it is, what kind of money it is, and whether it still counts. */
export function SignalLine({ signal, now, onOpen }: { signal: Signal; now: number; onOpen?: OpenDrawer }) {
  const old = outsideWindow(signal, now);

  return (
    <div className="rounded-xl bg-paper/60 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-yellow" />
        <span className="font-medium">{signal.label}</span>
        <span className="rounded-full bg-card px-1.5 py-0.5 text-[0.6875rem] font-medium text-ink-2 shadow-hairline">{SIGNAL_LABEL[signal.type]}</span>
        {signal.instrument && (
          <span className="text-[0.6875rem] text-ink-3">
            instrument {signal.instrument}
            {signal.type !== "public_money" && "; funder not classed as public"}
          </span>
        )}
      </div>
      <p className="mt-1 text-ink-2">
        {signalAmount(signal)}, {signalDate(signal)}
        {signal.origin === "derived" ? ". Reported by Cala from these documents" : ""}.
      </p>
      {signal.flag && <p className="mt-1 font-medium">Flagged: {signal.flag}</p>}
      {!signal.flag && old && <p className="mt-1 font-medium">Older than the {WINDOW_MONTHS}-month window, so it is context and not a signal.</p>}
      {onOpen && (
        <button
          type="button"
          onClick={() => onOpen({ kind: "signal", signal })}
          className="mt-1 rounded-sm text-[0.6875rem] font-medium text-ink-2 underline decoration-ink/30 underline-offset-2 hover:text-ink hover:decoration-ink"
        >
          Parties and {signal.sources.length === 1 ? "1 source" : `${signal.sources.length} sources`}
        </button>
      )}
    </div>
  );
}
