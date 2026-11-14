"use client";

import type { Dossier, EntityRef, Hop, Signal } from "@fundraising/package-ledger";
import { useEffect, useState } from "react";

import type { OpenDrawer } from "@/components/desk/drawer-target";
import { SignalLine } from "@/components/desk/signal-line";
import { EvidenceTag } from "@/components/ui/evidence";
import { SourceList } from "@/components/ui/sources";
import { formatDate, formatStamp } from "@/lib/format";
import { readable } from "@/lib/scope";
import { ago, hopSentence, isStale } from "@/lib/wording";

type Loaded = { id: string; dossier: Dossier } | { id: string; failed: "missing" | "cala" | "ledger" };

/**
 * Everything the store holds on one entity: its properties with their sources, its dated facts,
 * the claims that could not become edges, and the IDs that may be the same entity but are not
 * joined to it.
 */
export function DossierView({ entity, now, onOpen }: { entity: EntityRef; now: number; onOpen: OpenDrawer }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/dossiers/${entity.id}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) return setLoaded({ id: entity.id, dossier: await response.json() });

        setLoaded({ id: entity.id, failed: response.status === 404 ? "missing" : response.status === 503 ? "cala" : "ledger" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ id: entity.id, failed: "ledger" });
      });

    return () => controller.abort();
  }, [entity.id]);

  const current = loaded?.id === entity.id ? loaded : null;

  if (!current) {
    return (
      <p role="status" className="running-text w-fit text-sm">
        Opening the dossier
      </p>
    );
  }

  if ("failed" in current) {
    return (
      <p className="rounded-2xl bg-orange-tint px-4 py-3 text-sm">
        {current.failed === "missing" && "The store holds nothing on this entity beyond its name."}
        {current.failed === "cala" && "Cala is not answering, and this entity has not been read yet. Its dossier opens once it has."}
        {current.failed === "ledger" && "The ledger did not answer, so this dossier could not be opened. Close it and try again."}
      </p>
    );
  }

  const { dossier } = current;

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-ink-2">{dossier.entity.description ?? "No description stored."}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-3">
          <span>{dossier.entity.entityType}</span>
          <span className="font-mono">…{dossier.entity.id.slice(-8)}</span>
        </p>
        <p className="mt-3 rounded-xl bg-paper/60 px-3 py-2 text-sm">
          {dossier.readInFull ? "Read in full" : "Not read in full: known from other records only"}
          {dossier.fetchedAt ? `. Stored ${formatStamp(dossier.fetchedAt)}, ${ago(dossier.fetchedAt, now)}` : ""}
          {isStale(dossier.fetchedAt, now) && <strong className="font-demi">. Stale: older than a day</strong>}.
        </p>
      </div>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-demi">
          What Cala holds <EvidenceTag kind="observed" />
        </h3>
        {dossier.properties.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">Nothing beyond the name.</p>
        ) : (
          <dl className="mt-2 grid gap-3">
            {dossier.properties.map((property) => (
              <div key={property.name}>
                <dt className="text-meta text-ink-3">{readable(property.name.toUpperCase()).replace(/_/g, " ")}</dt>
                <dd className="text-sm">
                  {property.value}
                  <details className="mt-1">
                    <summary className="w-fit rounded-sm text-[0.6875rem] font-medium text-ink-2">
                      {property.sources.length === 1 ? "1 source" : `${property.sources.length} sources`}
                    </summary>
                    <div className="mt-2">
                      <SourceList sources={property.sources} />
                    </div>
                  </details>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <h3 className="text-sm font-demi">Signals</h3>
        {dossier.signals.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">None stored. That is none found so far, not none exist.</p>
        ) : (
          <div className="mt-2 grid gap-2">
            {dossier.signals.map((signal) => (
              <SignalLine key={signal.id} signal={signal} now={now} onOpen={onOpen} />
            ))}
          </div>
        )}
      </section>

      {dossier.unresolvedClaims.length > 0 && (
        <section>
          <h3 className="text-sm font-demi">Reported by Cala, not turned into edges</h3>
          <p className="mt-1 text-meta text-ink-3">
            A party in each claim does not resolve to one entity, so the claim stays here as evidence and joins nothing.
          </p>
          <ul className="mt-2 grid gap-3">
            {dossier.unresolvedClaims.map((claim) => (
              <li key={claim.claim}>
                <blockquote className="border-l-2 border-ink/30 pl-3 text-sm text-ink-2">{claim.claim}</blockquote>
                <div className="mt-2">
                  <SourceList sources={claim.sources} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dossier.possibleDuplicates.length > 0 && (
        <section>
          <h3 className="text-sm font-demi">May be the same entity</h3>
          <p className="mt-1 text-meta text-ink-3">A proposal only. The IDs stay separate and no trail crosses between them.</p>
          <ul className="mt-2 grid gap-2">
            {dossier.possibleDuplicates.map((duplicate) => (
              <li key={duplicate.entity.id} className="rounded-xl px-3 py-2.5 text-sm outline outline-1 -outline-offset-1 outline-dotted outline-ink/50">
                <span className="font-medium">{duplicate.entity.name}</span>{" "}
                <span className="font-mono text-[0.6875rem] text-ink-3">…{duplicate.entity.id.slice(-8)}</span>
                {duplicate.entity.description && <span className="block text-ink-2">{duplicate.entity.description}</span>}
                <span className="mt-1 block text-meta text-ink-3">{duplicate.basis}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** One hop of a trail: what it says, how it is known, and the documents under it. */
export function HopView({ hop }: { hop: Hop }) {
  return (
    <div className="grid gap-5">
      <div>
        <EvidenceTag kind="observed" />
        <p className="mt-1.5 text-lede">{hopSentence(hop)}</p>
      </div>

      {hop.family === "investment" && hop.direction === "undirected" && (
        <p className="rounded-2xl px-4 py-3 text-sm outline outline-1 -outline-offset-1 outline-dashed outline-ink/50">
          <strong className="font-demi">Undirected.</strong> No stored round shows one of the two as investor and the other as issuer. It is a
          tie, not an observed investment by either in the other.
        </p>
      )}

      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-meta text-ink-3">Where it comes from</dt>
          <dd>{hop.origin === "native" ? `Cala's graph: ${hop.relationship}` : "Derived by us from one claim Cala reported"}</dd>
        </div>
        {hop.role && (
          <div>
            <dt className="text-meta text-ink-3">Roles</dt>
            <dd>{hop.role}</dd>
          </div>
        )}
        {(hop.validSince || hop.validUntil) && (
          <div>
            <dt className="text-meta text-ink-3">Valid</dt>
            <dd>
              {hop.validSince ? `since ${formatDate(hop.validSince)}` : ""} {hop.validUntil ? `until ${formatDate(hop.validUntil)}` : ""}
            </dd>
          </div>
        )}
      </dl>

      {hop.claim && (
        <div>
          <h3 className="text-sm font-demi">The claim, as Cala reported it</h3>
          <blockquote className="mt-2 border-l-2 border-ink/30 pl-3 text-sm text-ink-2">{hop.claim}</blockquote>
          <p className="mt-2 text-meta text-ink-3">Reported by Cala from the documents below. It is not verified by a filing.</p>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-demi">Sources</h3>
        <SourceList sources={hop.sources} />
      </div>
    </div>
  );
}

/** One signal in full: the parties and their roles, how the funder was classed, and the sources. */
export function SignalView({ signal, now, onOpen }: { signal: Signal; now: number; onOpen: OpenDrawer }) {
  return (
    <div className="grid gap-5">
      <SignalLine signal={signal} now={now} />

      <div>
        <h3 className="text-sm font-demi">Parties</h3>
        <ul className="mt-2 grid gap-1.5 text-sm">
          {signal.parties.map((party) => (
            <li key={`${party.entity.id}:${party.role}`} className="flex flex-wrap items-center gap-x-2">
              <button
                type="button"
                onClick={() => onOpen({ kind: "entity", entity: party.entity })}
                className="rounded-sm font-medium underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
              >
                {party.entity.name}
              </button>
              <span className="font-mono text-[0.6875rem] text-ink-3">{party.role ?? "no role given"}</span>
            </li>
          ))}
        </ul>
      </div>

      {signal.publicBasis && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-demi">
            Why it counts as public money <EvidenceTag kind={signal.publicBasis.ours ? "inferred" : "observed"} />
          </h3>
          <p className="mt-1.5 text-sm text-ink-2">{signal.publicBasis.basis}</p>
        </div>
      )}

      {signal.claim && (
        <div>
          <h3 className="text-sm font-demi">The claim, as Cala reported it</h3>
          <blockquote className="mt-2 border-l-2 border-ink/30 pl-3 text-sm text-ink-2">{signal.claim}</blockquote>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-demi">Sources</h3>
        <SourceList sources={signal.sources} />
      </div>
    </div>
  );
}
