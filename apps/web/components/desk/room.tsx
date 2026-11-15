"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { closeResearch } from "@/app/m/[id]/actions";
import { cabalaStatus } from "@/components/cabala/status";
import { Button, ButtonLink } from "@/components/ui/button";
import { SiteHeader } from "@/components/ui/site-header";
import type { DeskSnapshot } from "@/lib/desk-types";
import { formatClock, formatStamp, plural } from "@/lib/format";
import { CATEGORY, MANDATE_LABEL, PATTERN, STAGE_LABEL } from "@/lib/wording";
import { CabalaPanel } from "./cabala-panel";
import { useCabalaSession } from "./session";

export function Room({ initial }: { initial: DeskSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [closed, setClosed] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const { mandate, rows, gaps, coverage } = snapshot.book;
  const desk = `/m/${mandate.id}/desk`;
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/mandates/${mandate.id}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Refresh failed");
      setSnapshot(await response.json());
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    }
  }, [mandate.id]);
  const session = useCabalaSession({
    mandateId: mandate.id,
    sessionId: mandate.sessionId,
    onTurnEnd: () => void refresh(),
  });
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  const now = new Date(snapshot.at).getTime();
  const status = cabalaStatus({
    stage: mandate.stage,
    stream: session.stream,
    events: snapshot.events,
    cala: coverage.cala,
    now,
  });
  const criteria = [
    ...(mandate.constraints.stages ?? []),
    ...(mandate.constraints.sectors ?? []),
    ...(mandate.constraints.geographies ?? []),
  ];
  const trailCount = new Set(rows.flatMap((row) => row.trailIds)).size;

  return (
    <>
      <SiteHeader>
        <Link href="/" className="text-sm text-ink-2 hover:text-ink">
          All mandates ↗
        </Link>
      </SiteHeader>
      <main className="mx-auto w-full max-w-page flex-1 px-4 pt-8 pb-12 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-meta text-ink-3">
              <span>{MANDATE_LABEL[mandate.role]}</span>
              <span aria-hidden="true">/</span>
              <span>Slush 2026</span>
              <span className="ml-1 rounded-full bg-card px-2.5 py-1 text-xs font-medium text-ink">
                {STAGE_LABEL[mandate.stage]}
              </span>
            </div>
            <h1 className="mt-3 text-[2rem] leading-tight tracking-tight sm:text-[2.5rem]">
              {mandate.subject.name}
            </h1>
            {mandate.constraints.notes && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
                {mandate.constraints.notes}
              </p>
            )}
            {criteria.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...new Set(criteria)].map((criterion) => (
                  <span
                    key={criterion}
                    className="rounded-md bg-wash px-2 py-1 text-xs text-ink-2"
                  >
                    {criterion}
                  </span>
                ))}
              </div>
            )}
          </div>
          <ButtonLink href={desk} variant="secondary" size="small">
            Evidence & criteria ↗
          </ButtonLink>
        </header>

        <dl className="mt-6 grid grid-cols-3 divide-x divide-line rounded-2xl bg-card px-2 py-4 shadow-hairline">
          {[
            [rows.length, "Ranked candidates"],
            [trailCount, "Supporting trails"],
            [snapshot.packets.length, "Packet versions"],
          ].map(([value, label]) => (
            <div key={label} className="px-3 sm:px-5">
              <dd className="text-2xl font-demi tabular-nums tracking-tight">
                {value}
              </dd>
              <dt className="mt-1 text-xs text-ink-3 sm:text-meta">{label}</dt>
            </div>
          ))}
        </dl>
        {(refreshFailed || coverage.cala === "latched") && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-orange-tint px-4 py-3 text-sm"
          >
            {refreshFailed
              ? "Updates are temporarily unavailable. Showing your last loaded results."
              : `Cala is not answering. Showing stored evidence from ${formatStamp(coverage.newestFetchAt) ?? "an unknown time"}.`}
          </p>
        )}

        <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
          <aside
            className="min-w-0 lg:sticky lg:top-5 lg:col-start-2 lg:row-start-1"
            aria-label="Conversation with Cabala"
          >
            <CabalaPanel
              session={session}
              prominent
              moment={false}
              now={now}
              status={status}
            />
          </aside>
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <section aria-labelledby="recommendations-title">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 id="recommendations-title" className="text-heading">
                    Your next conversations
                  </h2>
                  <p className="mt-1 text-meta text-ink-3">
                    The strongest connections for your brief.
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-3">
                  {Math.min(rows.length, 3)} of {rows.length}
                </span>
              </div>
              <div className="space-y-3">
                {rows.slice(0, 3).map((row, index) => (
                  <article
                    key={row.id}
                    className="rounded-card bg-card p-5 shadow-hairline transition-shadow hover:shadow-lift"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-sm font-medium tabular-nums">
                        0{index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-demi tracking-tight">
                          {row.candidate.name}
                        </h3>
                        <p
                          className="mt-0.5 text-xs text-ink-3"
                          title={CATEGORY[row.category].hint}
                        >
                          {CATEGORY[row.category].label} ·{" "}
                          {row.candidate.entityType}
                        </p>
                      </div>
                      {row.hasBrief && (
                        <span className="shrink-0 rounded-md bg-blue-tint px-2 py-1 text-[0.6875rem]">
                          Brief ready
                        </span>
                      )}
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-ink-2">
                      {row.reason}
                    </p>
                    {row.bestTrail && (
                      <div className="mt-4 rounded-xl bg-paper/55 px-3 py-2.5 text-xs text-ink-2">
                        <span className="font-medium">
                          {PATTERN[row.bestTrail.pattern]}
                        </span>
                        <span className="text-ink-3">
                          {" "}
                          · {plural(
                            row.bestTrail.hopCount,
                            "connection",
                          )} · {plural(row.trailIds.length, "trail")}
                        </span>
                        {row.bestTrail.signalLabel && (
                          <p className="mt-1.5 leading-relaxed">
                            {row.bestTrail.signalLabel}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                      <span className="text-xs text-ink-3">
                        {row.attendee
                          ? "Listed by Cala as an attendee"
                          : "Attendance unknown"}
                      </span>
                      <Button
                        size="small"
                        disabled={session.busy || session.resuming}
                        onClick={() =>
                          void session.send(
                            `Prepare a meeting packet for ${row.candidate.name}, candidate ID ${row.candidate.id}.`,
                          )
                        }
                      >
                        Prepare meeting ↗
                      </Button>
                    </div>
                  </article>
                ))}
                {!rows.length && (
                  <div className="rounded-card bg-card p-7 shadow-hairline">
                    <span className="text-meta text-ink-3">
                      RESEARCH WORKSPACE
                    </span>
                    <h3 className="mt-3 text-heading">
                      Your shortlist starts here.
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-2">
                      Cabala will look for connections with sources you can
                      open. Use the chat to add context or refine your
                      priorities.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2 text-xs text-ink-3">
                      {[
                        "Find connections",
                        "Check sources",
                        "Prepare meetings",
                      ].map((step, i) => (
                        <span
                          key={step}
                          className="rounded-full bg-paper px-3 py-1.5"
                        >
                          {i + 1}. {step}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Link
                className="mt-4 flex justify-between rounded-xl px-1 py-2 text-sm font-medium hover:underline"
                href={desk}
              >
                View all candidates and evidence{" "}
                <span aria-hidden="true">→</span>
              </Link>
            </section>

            {snapshot.packets.length > 0 && (
              <section
                className="mt-6 border-t border-line pt-5"
                aria-label="Meeting packets"
              >
                <h2 className="text-sm font-demi">Meeting packets</h2>
                <div className="mt-3 space-y-2">
                  {snapshot.packets.slice(0, 3).map((packet) => (
                    <Link
                      key={packet.version}
                      href={`/m/${mandate.id}/packet/${packet.version}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 text-sm shadow-hairline"
                    >
                      <span>
                        {packet.candidate.name}
                        <span className="ml-2 text-xs text-ink-3">
                          v{packet.version} · {packet.status}
                        </span>
                      </span>
                      <span aria-hidden="true">↗</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {gaps.length > 0 && (
              <details className="mt-5 rounded-xl bg-wash px-4 py-3 text-sm">
                <summary className="font-medium">
                  Open questions{" "}
                  <span className="ml-1 text-ink-3">({gaps.length})</span>
                </summary>
                <ul className="mt-3 space-y-2 text-meta leading-relaxed text-ink-2">
                  {gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </details>
            )}
            {snapshot.events.length > 0 && (
              <section
                className="mt-6 border-t border-line pt-5"
                aria-label="Recent activity"
              >
                <div className="flex justify-between">
                  <h2 className="text-sm font-demi">Recent activity</h2>
                  <Link
                    href={desk}
                    className="text-xs text-ink-3 hover:underline"
                  >
                    Full work log ↗
                  </Link>
                </div>
                <ol className="mt-3 space-y-3">
                  {snapshot.events
                    .slice(-3)
                    .reverse()
                    .map((event) => (
                      <li
                        key={event.id}
                        className="flex gap-3 text-xs leading-relaxed"
                      >
                        <time className="shrink-0 pt-0.5 text-ink-3 tabular-nums">
                          {formatClock(event.at)}
                        </time>
                        <p className="text-ink-2">{event.message}</p>
                      </li>
                    ))}
                </ol>
              </section>
            )}
          </div>
        </div>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-ink-3">
          <p>
            Evidence from Cala · Scope revision {mandate.revision} · Updated{" "}
            {formatClock(snapshot.at)}
          </p>
          <form
            action={async () => {
              try {
                await closeResearch(mandate.id);
                setClosed(true);
                setCloseError(null);
              } catch {
                setCloseError("Could not stop research. Please try again.");
              }
            }}
          >
            <Button
              type="submit"
              variant="ghost"
              size="small"
              disabled={closed}
            >
              {closed ? "Further research stopped" : "Stop further research"}
            </Button>
          </form>
          {closeError && (
            <p role="alert" className="w-full text-ink">
              {closeError}
            </p>
          )}
        </footer>
      </main>
    </>
  );
}
