import type { MandateStage, WorkEvent } from "@fundraising/package-ledger";

import type { CabalaState } from "@/components/cabala/states";

/** What the eve stream says is happening, reduced to what a pose can show. */
export type Stream =
  /** No session yet, or the stream cannot be reached. The work log may still move. */
  | { kind: "offline" }
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "calling"; names: readonly string[] }
  | { kind: "writing" }
  | { kind: "needs-you" }
  | { kind: "finished"; at: number }
  | { kind: "failed" };

export type CabalaStatus = {
  state: CabalaState;
  /** A bare verb phrase, such as "Asking Cala". */
  label: string;
  /** When the current step began, for showing how long it has run. */
  since: string | null;
};

type LogLine = Pick<WorkEvent, "kind" | "at" | "seconds" | "fromStore">;

/** Tools whose names start with a read verb show as reading; every other tool is work. */
const READS = /(^|_)(get|list|search|read|find|fetch|query|lookup|check|retrieve)(_|$)/;

/** How long the done pose is held before the figure goes back to idle. */
export const DONE_FOR = 1600;

/** A log line older than this no longer says what is happening now. */
const FRESH_FOR = 20_000;

/**
 * The one mapping from real events to Cabala's pose. The eve stream says whether a turn is
 * running and whether it waits on the customer; the durable work log says what the research is
 * doing, and wins where it knows more. A probe in flight is "Asking Cala", a quota wait is
 * "Queued for Cala" and is never dressed up as reading.
 */
export function cabalaStatus({
  stream,
  events,
  stage,
  cala,
  now,
}: {
  stream: Stream;
  events: readonly LogLine[];
  stage: MandateStage;
  cala: "answering" | "latched";
  now: number;
}): CabalaStatus {
  if (stream.kind === "failed") return { state: "error", label: "Stopped", since: null };
  if (stream.kind === "needs-you") return { state: "waiting", label: "Waiting for you", since: null };

  const turning = stream.kind === "thinking" || stream.kind === "calling" || stream.kind === "writing";
  const researching = stage === "researching" || stage === "challenging";
  const latest = events.at(-1) ?? null;

  if (turning || researching) {
    const probe = events.findLast((event) => event.kind === "probe" && event.seconds === null && !event.fromStore);

    if (probe) return { state: "reading", label: "Asking Cala", since: probe.at };

    if (latest?.kind === "outage" || (cala === "latched" && latest?.kind === "queued")) {
      return { state: "asleep", label: "Paused: Cala is not answering", since: latest.at };
    }

    if (latest?.kind === "queued") return { state: "asleep", label: "Queued for Cala", since: latest.at };

    if (stream.kind === "writing") return { state: "working", label: "Writing", since: null };

    if (stream.kind === "calling" && stream.names.length > 0) {
      return stream.names.some((name) => READS.test(name))
        ? { state: "reading", label: "Reading", since: null }
        : { state: "working", label: "Working", since: null };
    }

    if (latest && now - new Date(latest.at).getTime() < FRESH_FOR) {
      if (latest.kind === "read" || latest.kind === "probe") return { state: "reading", label: "Reading", since: null };
      if (latest.kind === "withheld") return { state: "thinking", label: "Second read", since: null };
      if (latest.kind === "trail" || latest.kind === "book" || latest.kind === "note") {
        return { state: "working", label: stage === "challenging" ? "Writing" : "Working", since: null };
      }
    }

    if (stream.kind === "calling") return { state: "working", label: "Working", since: null };

    return { state: "thinking", label: stage === "challenging" ? "Challenging" : turning ? "Thinking" : "Researching", since: null };
  }

  if (stream.kind === "finished" && now - stream.at < DONE_FOR) return { state: "done", label: "Done", since: null };

  if (cala === "latched" && latest?.kind === "outage") {
    return { state: "asleep", label: "Paused: Cala is not answering", since: latest.at };
  }

  if (stage === "ready") return { state: "idle", label: "Ready for your decision", since: null };
  if (stage === "delivered") return { state: "idle", label: "Delivered", since: null };

  return { state: "idle", label: stream.kind === "offline" ? "Brief received" : "Standing by", since: null };
}
