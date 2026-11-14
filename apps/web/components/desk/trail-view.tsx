"use client";

import type { BookRow, EntityRef, FitLine, Hop, Signal, Trail } from "@fundraising/package-ledger";
import { useState } from "react";

import type { OpenDrawer } from "@/components/desk/drawer-target";
import { EvidenceTag } from "@/components/ui/evidence";
import { SourceCount } from "@/components/ui/sources";
import { PATTERN, WINDOW_MONTHS, hopArrow, hopLabel, hopSentence, outsideWindow, signalAmount, signalDate } from "@/lib/wording";

type Edge = { hop: Hop; arrow: -1 | 0 | 1 };

/**
 * Lays a trail out from the subject: each hop adds the entity at its far end. `arrow` says which
 * way an investment points along the drawing, and is 0 wherever the evidence does not settle it.
 */
function chain(trail: Trail): { nodes: EntityRef[]; edges: Edge[] } {
  const nodes = [trail.subject];
  const edges: Edge[] = [];

  let current = trail.subject;

  for (const hop of trail.hops) {
    const forward = hop.from.id === current.id;
    const arrow = hopArrow(hop);

    current = forward ? hop.to : hop.from;
    nodes.push(current);
    edges.push({ hop, arrow: forward || arrow === 0 ? arrow : arrow === 1 ? -1 : 1 });
  }

  return { nodes, edges };
}

/** Solid for a tie whose direction is stated, dashed for one that is not, dotted for a reported agreement. */
function lineStyle(hop: Hop) {
  if (hop.family === "agreement") return "border-dotted";
  if (hop.family === "ownership") return "border-double";
  if (hop.family === "investment" && hop.direction === "undirected") return "border-dashed";

  return "border-solid";
}

function Arrowhead({ direction, className }: { direction: "left" | "right" | "up" | "down"; className: string }) {
  const turn = { right: 0, down: 90, left: 180, up: 270 }[direction];

  return (
    <svg aria-hidden="true" width="9" height="11" viewBox="0 0 9 11" className={`shrink-0 ${className}`} style={{ rotate: `${turn}deg` }}>
      <path d="M0.5 0.8 8.2 5.5 0.5 10.2Z" fill="currentColor" />
    </svg>
  );
}

/**
 * The chain runs across when its box is wide enough for every dot and label, and down otherwise.
 * A three-hop trail needs more room than a two-hop one, so each has its own breakpoint.
 */
const ACROSS = {
  short: {
    list: "@xl:flex-row @xl:items-start",
    node: "@xl:w-32 @xl:shrink-0 @xl:flex-col @xl:items-center @xl:gap-2 @xl:text-center",
    edge: "@xl:min-w-16 @xl:flex-1",
    button: "@xl:flex-col @xl:items-stretch @xl:gap-1.5 @xl:py-0 @xl:text-center",
    down: "@xl:hidden",
    across: "@xl:flex",
    label: "@xl:px-1",
    chip: "@xl:-mx-3 @xl:text-center",
    chipHead: "@xl:justify-center",
  },
  long: {
    list: "@3xl:flex-row @3xl:items-start",
    node: "@3xl:w-32 @3xl:shrink-0 @3xl:flex-col @3xl:items-center @3xl:gap-2 @3xl:text-center",
    edge: "@3xl:min-w-16 @3xl:flex-1",
    button: "@3xl:flex-col @3xl:items-stretch @3xl:gap-1.5 @3xl:py-0 @3xl:text-center",
    down: "@3xl:hidden",
    across: "@3xl:flex",
    label: "@3xl:px-1",
    chip: "@3xl:-mx-3 @3xl:text-center",
    chipHead: "@3xl:justify-center",
  },
} as const;

type Across = (typeof ACROSS)[keyof typeof ACROSS];

function SignalChip({ signal, now, onOpen, across }: { signal: Signal; now: number; onOpen: OpenDrawer; across?: Across }) {
  const context = signal.flag ? "Flagged: context only" : outsideWindow(signal, now) ? `Older than ${WINDOW_MONTHS} months: context only` : null;

  return (
    <button
      type="button"
      onClick={() => onOpen({ kind: "signal", signal })}
      className={`mt-2 flex flex-col gap-0.5 rounded-xl bg-yellow-tint px-2.5 py-2 text-left text-[0.6875rem] leading-snug shadow-hairline transition-shadow duration-150 hover:shadow-lift ${across?.chip ?? ""}`}
    >
      <span className={`flex items-center gap-1.5 font-medium ${across?.chipHead ?? ""}`}>
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-yellow" />
        Signal: {signal.label}
      </span>
      <span className="text-ink-2">
        {signalAmount(signal)}, {signalDate(signal)}
      </span>
      {context && <span className="font-medium text-ink">{context}</span>}
    </button>
  );
}

function Chain({ trail, active, now, onOpen }: { trail: Trail; active: boolean; now: number; onOpen: OpenDrawer }) {
  const { nodes, edges } = chain(trail);
  const across = nodes.length > 3 ? ACROSS.long : ACROSS.short;
  const tone = active ? "border-blue text-blue" : "border-edge text-edge";
  const attached = trail.signal && nodes.some((node) => node.id === trail.signal?.entity.id);

  return (
    <div className="@container">
      <ol className={`flex flex-col ${across.list}`}>
        {nodes.map((node, index) => {
          const edge = edges[index];
          const dot = index === 0 ? "bg-blue" : index === nodes.length - 1 ? "bg-orange" : "bg-lilac";
          const coverage = index === 0 ? "the subject" : trail.readInFull.includes(node.id) ? "read in full" : trail.seenInListOnly.includes(node.id) ? "seen in a list" : null;

          return (
            <li key={`${node.id}:${index}`} className="contents">
              <div className={`flex items-start gap-3 ${across.node}`}>
                <span aria-hidden="true" className={`relative z-10 size-5 shrink-0 rounded-full ${dot} ${active ? "" : "opacity-60"}`} />
                <div className="min-w-0 pb-1">
                  <button
                    type="button"
                    onClick={() => onOpen({ kind: "entity", entity: node })}
                    className="rounded-sm text-sm leading-tight font-medium underline decoration-ink/25 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-ink"
                  >
                    {node.name}
                  </button>
                  {coverage && <p className="mt-0.5 text-[0.6875rem] text-ink-3">{coverage}</p>}
                  {trail.signal && trail.signal.entity.id === node.id && (
                    <SignalChip signal={trail.signal} now={now} onOpen={onOpen} across={across} />
                  )}
                </div>
              </div>

              {edge && (
                <div className={across.edge}>
                  <button
                    type="button"
                    onClick={() => onOpen({ kind: "hop", hop: edge.hop })}
                    aria-label={`${hopSentence(edge.hop)} Open its ${edge.hop.sources.length} ${edge.hop.sources.length === 1 ? "source" : "sources"}.`}
                    className={`group flex w-full items-center gap-3 rounded-lg py-1 text-left ${across.button}`}
                  >
                    {/* Running down, under the dots. */}
                    <span aria-hidden="true" className={`ml-[5px] flex w-[10px] shrink-0 flex-col items-center ${across.down} ${tone}`}>
                      {edge.arrow === -1 && <Arrowhead direction="up" className="-mb-0.5" />}
                      <span className={`h-9 border-l-[3px] ${lineStyle(edge.hop)} ${active ? "border-blue" : "border-edge"}`} />
                      {edge.arrow === 1 && <Arrowhead direction="down" className="-mt-0.5" />}
                    </span>

                    {/* Running across, reaching into the columns of the two dots it joins. */}
                    <span aria-hidden="true" className={`-mx-12 mt-[4.5px] hidden h-[11px] items-center ${across.across} ${tone}`}>
                      {edge.arrow === -1 && <Arrowhead direction="left" className="-mr-0.5" />}
                      <span className={`h-0 flex-1 border-t-[3px] ${lineStyle(edge.hop)} ${active ? "border-blue" : "border-edge"}`} />
                      {edge.arrow === 1 && <Arrowhead direction="right" className="-ml-0.5" />}
                    </span>

                    <span className={`text-[0.6875rem] leading-snug font-medium text-ink-2 group-hover:text-ink ${across.label}`}>
                      {hopLabel(edge.hop)}
                      {edge.hop.origin === "derived" && <span className="block font-normal">reported by Cala</span>}
                      <span className="block font-normal underline decoration-ink/25 underline-offset-2 group-hover:decoration-ink">
                        {edge.hop.sources.length} {edge.hop.sources.length === 1 ? "source" : "sources"}
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {trail.signal && !attached && (
        <div className="max-w-xs">
          <SignalChip signal={trail.signal} now={now} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}

function Conclusion({ trail }: { trail: Trail }) {
  const { conclusion } = trail;

  if (!conclusion) {
    return <p className="text-sm text-ink-2">Cabala has not written a conclusion for this trail yet. The hops above are what was observed.</p>;
  }

  return (
    <div className="grid gap-4">
      <div>
        <EvidenceTag kind="inferred" />
        <p className="mt-1.5 text-lede text-ink">{conclusion.reading}</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="flex items-center gap-2 font-medium">
            Rests on <EvidenceTag kind="observed" />
          </dt>
          <dd className="mt-1 text-ink-2">{conclusion.because}</dd>
        </div>
        <div>
          <dt className="font-medium">Does not prove</dt>
          <dd className="mt-1 text-ink-2">{conclusion.doesNotProve}</dd>
        </div>
        <div>
          <dt className="font-medium">Ask</dt>
          <dd className="mt-1 text-ink-2">{conclusion.ask}</dd>
        </div>
      </dl>
    </div>
  );
}

export function FitLines({ lines, onOpen }: { lines: readonly FitLine[]; onOpen: OpenDrawer }) {
  return (
    <ul className="grid gap-2.5">
      {lines.map((line, index) => (
        <li key={`${line.criterion}:${index}`} className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[7.5rem_minmax(0,1fr)]">
          <span className="font-medium">{line.criterion}</span>
          <span>
            <span className="text-ink-2">{line.statement}</span>{" "}
            <span className="inline-flex flex-wrap items-center gap-1 align-middle">
              <EvidenceTag kind={line.kind} />
              <SourceCount
                count={line.sources.length}
                label={line.statement}
                onOpen={() => onOpen({ kind: "sources", title: line.criterion, sources: line.sources })}
              />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The selected recommendation's path, drawn as dots and typed edges on paper: the active trail in
 * blue, the others in grey. Every dot opens its dossier and every edge its sources. An edge whose
 * direction the evidence does not settle is dashed, has no arrowhead, and is worded as a tie.
 */
export function TrailPanel({
  row,
  trails,
  now,
  onOpen,
}: {
  row: BookRow;
  /** Null while the trails are being read. */
  trails: Trail[] | null;
  now: number;
  onOpen: OpenDrawer;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const active = trails?.find((trail) => trail.id === chosen) ?? trails?.[0] ?? null;

  return (
    <section aria-labelledby="trail-title" className="rounded-panel bg-card p-5 shadow-hairline sm:p-6">
      <p className="text-meta font-medium text-ink-3">Rank {row.rank}</p>
      <h2 id="trail-title" className="text-heading">
        {row.trailIds.length === 0 ? row.candidate.name : `The trail behind ${row.candidate.name}`}
      </h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-2">{row.reason}</p>

      {row.trailIds.length === 0 ? (
        <p className="mt-5 rounded-2xl px-4 py-3 text-sm outline outline-1 -outline-offset-1 outline-dotted outline-ink/50">
          {row.directFitOnly ? (
            <>
              <strong className="font-demi">Direct fit only.</strong> No connection between {row.candidate.name} and you, or anything in your
              portfolio, has been demonstrated. What follows is its own record.
            </>
          ) : row.enrichment === "queued" ? (
            <>
              <strong className="font-demi">No trail yet.</strong> The read that could find one is queued for Cala.
            </>
          ) : (
            <>
              <strong className="font-demi">No trail found.</strong> Nothing in the stored evidence connects this candidate further.
            </>
          )}
        </p>
      ) : trails === null ? (
        <p role="status" className="running-text mt-5 w-fit text-sm">
          Reading the trails
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3">
            {trails.map((trail, index) => {
              const isActive = trail.id === active?.id;

              return (
                <div
                  key={trail.id}
                  className={`rounded-card bg-paper px-4 pt-3 pb-4 ${isActive ? "shadow-[0_0_0_1.5px_var(--color-blue)]" : "shadow-hairline"}`}
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[0.6875rem] font-medium text-ink-2">
                      {trails.length > 1 ? `Trail ${index + 1} of ${trails.length}: ` : ""}
                      {PATTERN[trail.pattern]}, {trail.hopCount} {trail.hopCount === 1 ? "hop" : "hops"}
                      {trail.weakestSourceRank ? `, weakest source rank ${trail.weakestSourceRank}` : ", source ranks not given"}
                    </p>
                    {trails.length > 1 && (
                      <button
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setChosen(trail.id)}
                        className="h-6 rounded-full px-2.5 text-[0.6875rem] font-medium text-ink-2 shadow-hairline hover:text-ink aria-pressed:bg-ink aria-pressed:text-card"
                      >
                        {isActive ? "Shown below" : "Show its conclusion"}
                      </button>
                    )}
                  </div>
                  <Chain trail={trail} active={isActive} now={now} onOpen={onOpen} />
                </div>
              );
            })}
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.6875rem] text-ink-3" aria-label="How to read the edges">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="w-6 border-t-[3px] border-solid border-blue" />
              invested in, role stated in a round
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="w-6 border-t-[3px] border-dashed border-blue" />
              investment tie, direction not settled
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="w-6 border-t-[3px] border-dotted border-blue" />
              agreement, reported by Cala
            </li>
            <li>Signals count for {WINDOW_MONTHS} months.</li>
          </ul>

          {active && (
            <div className="mt-6 border-t border-line pt-5">
              {active.independentTrails > 1 && (
                <p className="mb-3 text-meta text-ink-3">
                  One of {active.independentTrails} independent trails to {active.end.name}. Repeats of the same tie are counted once.
                </p>
              )}
              <Conclusion trail={active} />
            </div>
          )}
        </>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-sm font-demi">Why it ranks here</h3>
        <div className="mt-3">
          <FitLines lines={row.fit} onOpen={onOpen} />
        </div>

        {row.unknowns.length > 0 && (
          <div className="mt-4">
            <EvidenceTag kind="unknown" />
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
              {row.unknowns.map((unknown) => (
                <li key={unknown}>{unknown}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
