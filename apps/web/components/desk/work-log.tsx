import type { Statement, WorkEvent, WorkEventKind } from "@fundraising/package-ledger";

import { Cabala } from "@/components/cabala/cabala";
import type { CabalaState } from "@/components/cabala/states";
import { probeInFlight } from "@/components/cabala/status";
import { formatClock, formatElapsed, plural } from "@/lib/format";

type Turn = { head: WorkEvent | null; lines: WorkEvent[] };

/** A stage line opens a turn; every line after it, up to the next stage line, belongs to it. */
function turnsOf(events: readonly WorkEvent[]): Turn[] {
  const turns: Turn[] = [];

  for (const event of events) {
    if (event.kind === "stage" || turns.length === 0) turns.push({ head: event.kind === "stage" ? event : null, lines: [] });
    if (event.kind !== "stage") turns.at(-1)!.lines.push(event);
  }

  return turns;
}

const MARK: Record<WorkEventKind, string> = {
  stage: "bg-ink",
  read: "bg-blue",
  probe: "bg-blue",
  trail: "bg-blue",
  book: "bg-ink",
  note: "bg-ink/40",
  withheld: "bg-orange",
  queued: "outline outline-1 outline-dotted outline-ink/70",
  outage: "bg-orange",
  gap: "outline outline-1 outline-dotted outline-ink/70",
};

/** Lines kept in view for a turn that is over. The rest fold away. */
const KEEP = 4;

function Line({ event, now, running }: { event: WorkEvent; now: number; running: boolean }) {

  return (
    <li className="flex gap-2.5 text-sm">
      <span aria-hidden="true" className={`mt-[7px] size-1.5 shrink-0 rounded-full ${MARK[event.kind]}`} />
      <span className="min-w-0">
        <span className={running ? "running-text" : "text-ink-2"}>{running ? "Asking Cala: " : ""}{event.message}</span>{" "}
        <span className="text-[0.6875rem] whitespace-nowrap text-ink-3 tabular-nums">
          {running
            ? formatElapsed((now - new Date(event.at).getTime()) / 1000)
            : [event.fromStore ? "from the store" : null, event.seconds ? formatElapsed(event.seconds) : null].filter(Boolean).join(", ")}
        </span>
      </span>
    </li>
  );
}

/**
 * The durable work log: what trusted code recorded, turn by turn. Each turn opens with Cabala's
 * bust and a short verb with its time; a probe in flight says "Asking Cala" and counts up.
 */
export function WorkLog({
  events,
  statement,
  state,
  live,
  now,
}: {
  events: readonly WorkEvent[];
  statement: Statement;
  /** Cabala's pose right now, shown on the turn that is still open. */
  state: CabalaState;
  live: boolean;
  now: number;
}) {
  const turns = turnsOf(events);
  const asking = probeInFlight(events, now);

  return (
    <section aria-labelledby="log-title" className="rounded-card bg-card p-5 shadow-hairline">
      <h2 id="log-title" className="text-heading">
        Work log
      </h2>
      <p className="mt-0.5 text-meta text-ink-3">
        {plural(statement.reads, "read")}, {plural(statement.probes, "probe")}, {statement.servedFromStore} served from the store,{" "}
        {plural(statement.trailsFound, "trail")}
      </p>

      {turns.length === 0 ? (
        <p className="mt-4 text-sm text-ink-2">Nothing recorded yet. Lines appear here as Cabala works, and stay.</p>
      ) : (
        <ol className="mt-4 grid gap-5">
          {turns.map((turn, index) => {
            const last = index === turns.length - 1;
            const open = last && live;
            const started = turn.head?.at ?? turn.lines[0]?.at;
            const ended = last ? (open ? now : new Date(turn.lines.at(-1)?.at ?? started ?? 0).getTime()) : new Date(turns[index + 1].head?.at ?? 0).getTime();
            const seconds = started ? (ended - new Date(started).getTime()) / 1000 : 0;
            const folded = !last && turn.lines.length > KEEP ? turn.lines.length - KEEP : 0;

            return (
              <li key={turn.head?.id ?? `turn-${index}`}>
                <div className="flex items-center gap-2.5">
                  <Cabala state={open ? state : "idle"} variant="bust" size={28} />
                  <p className="text-sm">
                    <span className={`font-medium ${open ? "running-text" : ""}`}>{turn.head?.message ?? "Before the first stage"}</span>{" "}
                    <span className="text-[0.6875rem] text-ink-3 tabular-nums">
                      {started ? formatClock(started) : ""}
                      {seconds >= 1 ? `, ${open ? "" : "took "}${formatElapsed(seconds)}` : ""}
                    </span>
                  </p>
                </div>

                {turn.lines.length > 0 && (
                  <ul className="mt-2 grid gap-1.5 pl-[38px]">
                    {turn.lines.slice(0, folded ? KEEP : undefined).map((event) => (
                      <Line key={event.id} event={event} now={now} running={event.id === asking?.id} />
                    ))}
                    {folded > 0 && (
                      <li>
                        <details>
                          <summary className="w-fit rounded-sm text-[0.6875rem] font-medium text-ink-2">and {plural(folded, "more line")}</summary>
                          <ul className="mt-1.5 grid gap-1.5">
                            {turn.lines.slice(KEEP).map((event) => (
                              <Line key={event.id} event={event} now={now} running={event.id === asking?.id} />
                            ))}
                          </ul>
                        </details>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
