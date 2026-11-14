"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { cabalaStatus, type Stream } from "@/components/cabala/status";
import { DeskBanners } from "@/components/desk/banners";
import { BookPanel } from "@/components/desk/book";
import { BriefCard } from "@/components/desk/brief-card";
import { CabalaPanel } from "@/components/desk/cabala-panel";
import { DossierView, HopView, SignalView } from "@/components/desk/dossier";
import type { DrawerTarget } from "@/components/desk/drawer-target";
import { ScopePanel } from "@/components/desk/scope";
import { useCabalaSession } from "@/components/desk/session";
import { Shelf } from "@/components/desk/shelf";
import { StageSteps } from "@/components/desk/stage-steps";
import { StatementOfWork } from "@/components/desk/statement";
import { TrailPanel } from "@/components/desk/trail-view";
import { WorkLog } from "@/components/desk/work-log";
import { Button, buttonClass } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { SiteHeader } from "@/components/ui/site-header";
import { SourceList } from "@/components/ui/sources";
import { BRIEFS, detailKey, type CandidateDetail, type DeskSnapshot } from "@/lib/desk-types";
import type { Observed } from "@/lib/scope";
import { MANDATE_LABEL, beingWorked, hopLabel } from "@/lib/wording";

/** How often the Desk asks the ledger for news: often while Cabala works, seldom once it rests. */
const POLL_WORKING = 3000;
const POLL_RESTING = 20_000;

function drawerTitle(target: DrawerTarget): { eyebrow: string; title: string } {
  if (target.kind === "entity") return { eyebrow: "Dossier", title: target.entity.name };
  if (target.kind === "signal") return { eyebrow: "Signal", title: target.signal.label };
  if (target.kind === "sources") return { eyebrow: "Sources", title: target.title };

  return { eyebrow: `Hop: ${hopLabel(target.hop)}`, title: `${target.hop.from.name} and ${target.hop.to.name}` };
}

/**
 * The Desk of one mandate: its stage, the ranked Book, the trail behind the selected row, the
 * briefs, Cabala, the work log and the statement of work. It is drawn from the ledger and redrawn
 * from it every few seconds while the mandate is being worked; the eve session adds only what
 * Cabala is doing this moment and what it needs from the customer.
 */
export function Desk({
  initial,
  initialDetails,
  observed,
}: {
  initial: DeskSnapshot;
  initialDetails: Record<string, CandidateDetail>;
  observed: Observed;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [details, setDetails] = useState(initialDetails);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [gone, setGone] = useState(false);
  const [celebrated, setCelebrated] = useState<number | null>(null);

  // The browser's clock is only used to count; the server's says what time it is.
  const [now, setNow] = useState(() => new Date(initial.at).getTime());
  const skew = useRef(0);
  const stageSeen = useRef(initial.book.mandate.stage);
  const trail = useRef<HTMLDivElement>(null);

  const { book, events, statement, packets } = snapshot;
  const { mandate, rows, coverage } = book;

  async function refresh() {
    try {
      const response = await fetch(`/api/mandates/${mandate.id}`, { cache: "no-store" });

      if (response.status === 404) return setGone(true);
      if (!response.ok) throw new Error(String(response.status));

      const next = (await response.json()) as DeskSnapshot;

      skew.current = new Date(next.at).getTime() - Date.now();

      // The moment a mandate turns ready or delivered is a delivery, and gets the done pose.
      if (next.book.mandate.stage !== stageSeen.current) {
        stageSeen.current = next.book.mandate.stage;
        if (!beingWorked(next.book.mandate.stage)) setCelebrated(Date.now() + skew.current);
      }

      setSnapshot(next);
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    }
  }

  const session = useCabalaSession({ mandateId: mandate.id, sessionId: mandate.sessionId, onTurnEnd: () => void refresh() });

  const poll = useEffectEvent(() => {
    if (!document.hidden) void refresh();
  });

  const working = beingWorked(mandate.stage) || session.busy;

  useEffect(() => {
    if (gone) return;

    const timer = setInterval(poll, working ? POLL_WORKING : POLL_RESTING);

    return () => clearInterval(timer);
  }, [working, gone]);

  useEffect(() => {
    skew.current = new Date(initial.at).getTime() - Date.now();

    const timer = setInterval(() => setNow(Date.now() + skew.current), 1000);

    return () => clearInterval(timer);
  }, [initial.at]);

  const selected = rows.find((row) => row.candidate.id === selectedId) ?? rows[0] ?? null;
  const briefed = rows.filter((row) => row.hasBrief).slice(0, BRIEFS);

  // The detail of the selected row and of every briefed row, read once per version of the row.
  const wanted = [...new Set([selected, ...briefed].filter((row) => row !== null))];
  const missing = wanted.filter((row) => !(detailKey(row) in details));
  const missingKeys = missing.map(detailKey).join(" ");

  const load = useEffectEvent(() => {
    for (const row of missing) {
      const key = detailKey(row);

      fetch(`/api/mandates/${mandate.id}/candidates/${row.candidate.id}${row.hasBrief ? "?brief=1" : ""}`, { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<CandidateDetail>) : Promise.reject(new Error(String(response.status)))))
        .then((detail) => setDetails((current) => ({ ...current, [key]: detail })))
        .catch(() => setUnreachable(true));
    }
  });

  useEffect(() => {
    if (missingKeys) load();
  }, [missingKeys]);

  const stream: Stream =
    celebrated !== null && (session.stream.kind === "idle" || session.stream.kind === "offline") ? { kind: "finished", at: celebrated } : session.stream;

  const status = cabalaStatus({ stream, events, stage: mandate.stage, cala: coverage.cala, now });
  const settled = !beingWorked(mandate.stage);
  // The full figure stands for the hire and for a delivery; while Cabala researches it is a bust.
  const moment = mandate.stage !== "researching" && mandate.stage !== "challenging";

  function select(candidateId: string) {
    setSelectedId(candidateId);

    // On a phone and a narrow desk the trail sits below the Book; bring it to the reader.
    requestAnimationFrame(() => {
      const panel = trail.current;

      if (panel && panel.getBoundingClientRect().top > window.innerHeight * 0.6) {
        panel.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    });
  }

  function ask(text: string) {
    void session.send(text);
    document.getElementById("cabala")?.scrollIntoView({ block: "nearest" });
  }

  if (gone) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-page flex-1 px-4 pt-16 text-center sm:px-6">
          <h1 className="text-title">This mandate is no longer open here.</h1>
          <p className="mx-auto mt-3 max-w-[48ch] text-ink-2">The ledger no longer returns it for this browser. Nothing on this page is current.</p>
          <Link href="/" className={`${buttonClass()} mt-6`}>
            Hire Cabala
          </Link>
        </main>
      </>
    );
  }

  const selectedDetail = selected ? (details[detailKey(selected)] ?? null) : null;
  const title = drawer ? drawerTitle(drawer) : null;

  return (
    <>
      <SiteHeader wide>
        <Link href="/" className="rounded-full text-sm text-ink-2 underline decoration-ink/25 underline-offset-2 hover:text-ink hover:decoration-ink">
          All mandates
        </Link>
      </SiteHeader>

      <main className="mx-auto w-full max-w-[100rem] flex-1 px-4 pt-8 pb-24 sm:px-6">
        <header className="grid gap-4">
          <div>
            <p className="text-meta font-medium tracking-wide text-ink-3 uppercase">
              {MANDATE_LABEL[mandate.role]}, Slush 2026 preparation
            </p>
            <h1 className="mt-1 text-title [overflow-wrap:anywhere]">{mandate.subject.name}</h1>
          </div>

          <StageSteps stage={mandate.stage} />
          <DeskBanners coverage={coverage} now={now} unreachable={unreachable} />
          <ScopePanel mandate={mandate} observed={observed} onRevised={() => void refresh()} />
        </header>

        {/* On a phone Cabala's state leads, and the panel that answers it sits further down. */}
        <a
          href="#cabala"
          className="mt-4 flex items-center justify-between gap-3 rounded-full bg-card py-1.5 pr-4 pl-1.5 text-sm shadow-hairline lg:hidden"
        >
          <span className="flex items-center gap-2.5">
            <span className={`size-2.5 shrink-0 rounded-full ${status.state === "waiting" ? "bg-yellow" : status.state === "error" ? "bg-orange" : "bg-blue"} ml-2.5`} />
            <span className="font-medium">Cabala: {status.label}</span>
          </span>
          <span className="text-ink-2">{status.state === "waiting" ? "Answer" : "Instruct"}</span>
        </a>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[21rem_minmax(0,1fr)]">
            <BookPanel book={book} selectedId={selected?.candidate.id ?? null} onSelect={select} />

            <div ref={trail} className="grid min-w-0 scroll-mt-4 gap-6">
              {selected && <TrailPanel key={selected.candidate.id} row={selected} trails={selectedDetail?.trails ?? null} now={now} onOpen={setDrawer} />}

              {briefed.length > 0 && (
                <section aria-labelledby="briefs-title" className="grid gap-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="briefs-title" className="text-heading">
                      Briefs
                    </h2>
                    <p className="text-meta text-ink-3">
                      {briefed.length} of {BRIEFS}, for the strongest rows the evidence can carry
                    </p>
                  </div>

                  {briefed.map((row) => {
                    const brief = details[detailKey(row)]?.brief;
                    const packet = packets.findLast((candidate) => candidate.candidate.id === row.candidate.id && candidate.status !== "superseded");

                    return brief ? (
                      <BriefCard
                        key={row.id}
                        brief={brief}
                        rank={row.rank}
                        selected={row.candidate.id === selected?.candidate.id}
                        now={now}
                        onOpen={setDrawer}
                        onShowTrail={() => select(row.candidate.id)}
                        actions={
                          packet ? (
                            <Link href={`/m/${mandate.id}/packet/${packet.version}`} className={buttonClass({ size: "small" })}>
                              Open the packet, version {packet.version}
                            </Link>
                          ) : (
                            <Button size="small" variant="secondary" onClick={() => ask(`Build the meeting packet for ${row.candidate.name}.`)}>
                              Ask Cabala for the packet
                            </Button>
                          )
                        }
                      />
                    ) : (
                      <p key={row.id} role="status" className="running-text w-fit text-sm">
                        Opening the brief for {row.candidate.name}
                      </p>
                    );
                  })}
                </section>
              )}

              {(book.gaps.length > 0 || (settled && briefed.length < BRIEFS)) && (
                <section aria-labelledby="gaps-title" className="rounded-panel p-5 outline outline-1 -outline-offset-1 outline-dotted outline-ink/50 sm:p-6">
                  <h2 id="gaps-title" className="text-heading">
                    {settled && briefed.length < BRIEFS ? `Insufficient evidence for ${BRIEFS} briefs` : "Gap report"}
                  </h2>
                  <p className="mt-1 max-w-[65ch] text-sm text-ink-2">
                    {settled && briefed.length < BRIEFS
                      ? `${briefed.length === 0 ? "No brief" : briefed.length === 1 ? "One brief" : `${briefed.length} briefs`} could be written. The rest were left out, not filled in.`
                      : "What the research could not establish. A gap is something not found, not something ruled out."}
                  </p>
                  {book.gaps.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                      {book.gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          </div>

          <div className="grid min-w-0 gap-6">
            <CabalaPanel status={status} session={session} moment={moment} now={now} />
            <WorkLog events={events} statement={statement} state={status.state} live={working} now={now} />
            <StatementOfWork statement={statement} />
            <Shelf book={book} packets={packets} />
          </div>
        </div>
      </main>

      <Drawer open={drawer !== null} onClose={() => setDrawer(null)} title={title?.title ?? ""} eyebrow={title?.eyebrow}>
        {drawer?.kind === "entity" && <DossierView key={drawer.entity.id} entity={drawer.entity} now={now} onOpen={setDrawer} />}
        {drawer?.kind === "hop" && <HopView hop={drawer.hop} />}
        {drawer?.kind === "signal" && <SignalView signal={drawer.signal} now={now} onOpen={setDrawer} />}
        {drawer?.kind === "sources" && <SourceList sources={drawer.sources} />}
      </Drawer>
    </>
  );
}
