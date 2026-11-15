"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/ui/site-header";
import { Button } from "@/components/ui/button";
import { CabalaPanel } from "./cabala-panel";
import { useCabalaSession } from "./session";
import { cabalaStatus } from "@/components/cabala/status";
import type { DeskSnapshot } from "@/lib/desk-types";
import { closeResearch } from "@/app/m/[id]/actions";
export function Room({ initial }: { initial: DeskSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [closed, setClosed] = useState(false);
  const { mandate, rows, gaps } = snapshot.book;
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/mandates/${mandate.id}`, { cache: "no-store" });
    if (response.ok) setSnapshot(await response.json());
  }, [mandate.id]);
  const session = useCabalaSession({ mandateId: mandate.id, sessionId: mandate.sessionId, onTurnEnd: () => void refresh() });
  useEffect(() => { const timer = setInterval(() => { void refresh().catch(() => {}); }, 10000); return () => clearInterval(timer); }, [refresh]);
  return <><SiteHeader /><main className="mx-auto w-full max-w-page flex-1 px-5 py-12">
    <p className="text-meta text-ink-3">Your mandate</p><h1 className="mt-2 text-display">{mandate.subject.name}</h1>
    {mandate.constraints.notes && <p className="mt-4 max-w-2xl text-lede text-ink-2">{mandate.constraints.notes}</p>}
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"><section aria-label="Recommended meetings" className="space-y-4">
      {rows.slice(0, 3).map((row) => <article key={row.id} className="rounded-panel bg-card p-6 shadow-hairline">
        <h2 className="text-heading">{row.candidate.name}</h2><p className="mt-2 text-ink-2">{row.reason}</p>
        <p className="mt-3 text-meta text-ink-3">{row.attendee ? "Listed by Cala as an attendee" : "Attendance unknown"}</p>
        <Button className="mt-5" disabled={session.busy || session.resuming} onClick={() => void session.send(`Prepare a meeting packet for ${row.candidate.name}, candidate ID ${row.candidate.id}.`)}>Prepare meeting</Button>
      </article>)}
      {!rows.length && <p className="py-8 text-ink-2">Cabala is looking for connections with sources you can open. The conversation shows what it needs from you.</p>}
      <Link className="inline-block py-3 text-sm underline underline-offset-4" href={`/m/${mandate.id}/desk`}>Open the full Desk · evidence, criteria and packets</Link>
      {gaps.length > 0 && <details className="text-sm text-ink-2"><summary>What is still unknown</summary><ul className="mt-3 space-y-2">{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></details>}
    </section><CabalaPanel session={session} moment={mandate.stage === "brief_received" || session.asks.length > 0} now={new Date(snapshot.at).getTime()} status={cabalaStatus({ stage: mandate.stage, stream: session.stream, events: snapshot.events, cala: snapshot.book.coverage.cala, now: new Date(snapshot.at).getTime() })} /></div>
    <form className="mt-12" action={async () => { await closeResearch(mandate.id); setClosed(true); }}><Button type="submit" variant="ghost" disabled={closed}>{closed ? "Further research stopped" : "Stop further research"}</Button></form>
  </main></>;
}
