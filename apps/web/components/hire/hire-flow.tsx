"use client";

import type { Dossier, EntityMatch, EvidenceKind, Role } from "@fundraising/package-ledger";
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { hire, type HireState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { EvidenceTag } from "@/components/ui/evidence";
import { SourceList } from "@/components/ui/sources";
import { SCOPE_FIELDS as FIELDS, SCOPE_LABELS as LABELS, observedFrom, scopeKind, type Observed, type ScopeField as FieldName } from "@/lib/scope";
import { MANDATE_LABEL } from "@/lib/wording";

const ROLES: { role: Role; title: string; body: string }[] = [
  {
    role: "founder",
    title: "I am raising",
    body: "A Raise Mandate: which investors deserve your next approach, and what they will ask.",
  },
  {
    role: "investor",
    title: "I am investing",
    body: "A Sourcing Mandate: which companies deserve a first meeting, and what to ask them.",
  },
];

type Search =
  | { status: "idle" }
  | { status: "looking" }
  | { status: "found"; matches: EntityMatch[] }
  | { status: "failed"; reason: "cala" | "ledger" };

/** Looks the name up after a pause in typing, and drops the answer to anything typed before. */
function useEntitySearch(query: string): Search {
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setSearch({ status: "looking" });

      try {
        const response = await fetch(`/api/entities?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });

        if (response.status === 503) return setSearch({ status: "failed", reason: "cala" });
        if (!response.ok) return setSearch({ status: "failed", reason: "ledger" });

        setSearch({ status: "found", matches: (await response.json()).matches });
      } catch {
        if (!controller.signal.aborted) setSearch({ status: "failed", reason: "ledger" });
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  return trimmed.length < 2 ? { status: "idle" } : search;
}

function Step({ number, title, done, children }: { number: number; title: string; done?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-6 first:border-t-0 first:pt-0 last:pb-0">
      <h3 className="flex items-baseline gap-3 text-heading">
        <span aria-hidden="true" className="grid size-6 shrink-0 translate-y-[-1px] place-items-center rounded-full bg-ink text-xs font-medium text-card">
          {number}
        </span>
        <span>
          {title}
          {done && <span className="ml-2 text-base font-normal tracking-normal text-ink-2">{done}</span>}
        </span>
      </h3>
      <div className="mt-4 sm:pl-9">{children}</div>
    </section>
  );
}

/**
 * The hire: who the customer is, which entity in Cala they are, the brief as Cala would fill it
 * in and as they correct it, and a scope to confirm. What Cala holds is Observed; anything the
 * customer changes or adds is Self-reported; what neither supplies stays Still unknown.
 */
export function HireFlow() {
  const [role, setRole] = useState<Role | null>(null);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<EntityMatch | null>(null);
  const [observed, setObserved] = useState<Observed | "loading" | "failed">("loading");
  const [values, setValues] = useState<Record<FieldName, string>>({ stages: "", sectors: "", geographies: "" });
  const [exclusions, setExclusions] = useState("");
  const [notes, setNotes] = useState("");
  const [backers, setBackers] = useState(true);
  const [publicFunding, setPublicFunding] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const [state, action, pending] = useActionState<HireState, FormData>(hire, { error: null });

  const search = useEntitySearch(subject ? "" : query);
  const searchId = useId();
  const brief = useRef<HTMLDivElement>(null);
  const scope = useRef<HTMLDivElement>(null);

  async function choose(match: EntityMatch) {
    setSubject(match);
    setObserved("loading");
    setConfirming(false);

    try {
      const response = await fetch(`/api/dossiers/${match.id}`);

      if (!response.ok) throw new Error(String(response.status));

      const found = observedFrom((await response.json()) as Dossier);

      setObserved(found);
      setValues({
        stages: found.stages?.value ?? "",
        sectors: found.sectors?.value ?? "",
        geographies: found.geographies?.value ?? "",
      });
    } catch {
      setObserved("failed");
      setValues({ stages: "", sectors: "", geographies: "" });
    }

    brief.current?.focus();
  }

  function change() {
    setSubject(null);
    setConfirming(false);
  }

  /** How one scope field is known, given what Cala holds and what is typed. */
  const kindOf = (name: FieldName): EvidenceKind => scopeKind(values[name], typeof observed === "object" ? observed[name] : undefined);

  const known = typeof observed === "object" ? observed : {};
  const noun = role === "investor" ? "fund" : "company";

  return (
    <div className="rounded-panel bg-card p-5 shadow-hairline sm:p-8">
      <Step number={1} title="Who is Cabala working for?">
        <div role="radiogroup" aria-label="Who is Cabala working for?" className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((option) => (
            <label
              key={option.role}
              className="flex cursor-pointer flex-col gap-1 rounded-card px-4 py-3.5 shadow-hairline transition-[background-color,box-shadow] duration-150 has-checked:bg-yellow-tint has-checked:shadow-[0_0_0_2px_var(--color-ink)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
            >
              <span className="flex items-center gap-2 font-demi tracking-tight">
                <input
                  type="radio"
                  name="role-choice"
                  value={option.role}
                  checked={role === option.role}
                  onChange={() => {
                    setRole(option.role);
                    setConfirming(false);
                  }}
                  className="size-4 accent-ink outline-none"
                />
                {option.title}
              </span>
              <span className="text-sm text-ink-2">{option.body}</span>
            </label>
          ))}
        </div>
      </Step>

      {role && (
        <Step number={2} title={`Find your ${noun} in Cala`} done={subject ? subject.name : undefined}>
          {subject ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-paper/60 px-4 py-3">
              <Match match={subject} />
              <Button variant="secondary" size="small" onClick={change}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <label htmlFor={searchId} className="text-sm font-medium">
                Name of your {noun}
              </label>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={role === "investor" ? "OTB Ventures" : "Redpine"}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={`${searchId}-status`}
                className="mt-1.5 block h-12 w-full rounded-full bg-paper/70 px-5 text-base shadow-hairline placeholder:text-ink-3"
              />

              <div id={`${searchId}-status`} role="status" aria-live="polite" className="mt-3 text-sm text-ink-2">
                {search.status === "idle" && "Type at least two letters. This only finds who you are; Cabala does the research."}
                {search.status === "looking" && <span className="running-text">Looking in the store, then in Cala</span>}
                {search.status === "failed" &&
                  (search.reason === "cala"
                    ? "Cala is not answering, and nothing under that name is stored. Try another spelling, or come back when Cala answers."
                    : "The ledger did not answer. Nothing was found or ruled out. Try again.")}
                {search.status === "found" && search.matches.length === 0 && "Nothing under that name, in the store or in Cala. Try the legal name."}
                {search.status === "found" && search.matches.length > 1 && (
                  <>Several entities carry this name. Cala keeps them apart, and so does Cabala: pick the one you mean.</>
                )}
              </div>

              {search.status === "found" && search.matches.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {search.matches.map((match) => (
                    <li key={match.id}>
                      <button
                        type="button"
                        onClick={() => choose(match)}
                        className="w-full rounded-card bg-paper/60 px-4 py-3 text-left shadow-hairline transition-shadow duration-150 hover:shadow-lift"
                      >
                        <Match match={match} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Step>
      )}

      {role && subject && (
        <Step number={3} title="The brief, as Cala has it">
          <div ref={brief} tabIndex={-1} className="outline-none">
            {observed === "loading" ? (
              <p role="status" className="running-text w-fit text-sm">
                Reading what the store holds on {subject.name}
              </p>
            ) : (
              <>
                <p className="max-w-[60ch] text-sm text-ink-2">
                  {observed === "failed"
                    ? "The store could not be read, so nothing is filled in. Whatever you type is yours."
                    : Object.keys(known).length === 0
                      ? `The store holds nothing on ${subject.name} that fills this in. Whatever you type is yours.`
                      : "Filled in from what Cala holds. Correct anything: your words replace Cala's, and are marked as yours."}
                </p>

                <div className="mt-5 grid gap-5">
                  {FIELDS.map(({ name }) => {
                    const kind = kindOf(name);
                    const source = known[name];

                    return (
                      <div key={name}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <label htmlFor={`${searchId}-${name}`} className="text-sm font-medium">
                            {LABELS[role][name].label}
                          </label>
                          <EvidenceTag kind={kind} />
                        </div>
                        <input
                          id={`${searchId}-${name}`}
                          value={values[name]}
                          onChange={(event) => {
                            setValues({ ...values, [name]: event.target.value });
                            setConfirming(false);
                          }}
                          aria-describedby={`${searchId}-${name}-hint`}
                          autoComplete="off"
                          className="mt-1.5 block h-11 w-full rounded-full bg-paper/70 px-4 text-base shadow-hairline"
                        />
                        <div id={`${searchId}-${name}-hint`} className="mt-1.5 text-meta text-ink-3">
                          {source ? (
                            <details>
                              <summary className="w-fit rounded-sm">
                                Cala has &ldquo;{source.raw}&rdquo;
                                {kind === "self_reported" ? ", which you replaced" : ""}. See {source.sources.length === 1 ? "its source" : `its ${source.sources.length} sources`}
                              </summary>
                              <div className="mt-2 max-w-xl">
                                <SourceList sources={source.sources} />
                              </div>
                            </details>
                          ) : (
                            <>Nothing stored. {LABELS[role][name].hint}</>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <label htmlFor={`${searchId}-exclusions`} className="text-sm font-medium">
                        Rule out
                      </label>
                      <EvidenceTag kind={exclusions.trim() ? "self_reported" : "unknown"} />
                    </div>
                    <input
                      id={`${searchId}-exclusions`}
                      value={exclusions}
                      onChange={(event) => setExclusions(event.target.value)}
                      placeholder="Names, separated by commas"
                      autoComplete="off"
                      className="mt-1.5 block h-11 w-full rounded-full bg-paper/70 px-4 text-base shadow-hairline placeholder:text-ink-3"
                    />
                    <p className="mt-1.5 text-meta text-ink-3">Cabala leaves these out of the Book. Nothing is excluded unless you say so.</p>
                  </div>

                  {role === "founder" && (
                    <fieldset className="grid gap-2.5">
                      <legend className="mb-2 text-sm font-medium">Besides new investors</legend>
                      <Toggle checked={backers} onChange={setBackers}>
                        List my existing backers as follow-up targets. They never count as new leads.
                      </Toggle>
                      <Toggle checked={publicFunding} onChange={setPublicFunding}>
                        List public funders, as a separate non-dilutive category.
                      </Toggle>
                    </fieldset>
                  )}

                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <label htmlFor={`${searchId}-notes`} className="text-sm font-medium">
                        Anything else Cabala should know
                      </label>
                      <EvidenceTag kind={notes.trim() ? "self_reported" : "unknown"} />
                    </div>
                    <textarea
                      id={`${searchId}-notes`}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={3}
                      className="mt-1.5 block w-full rounded-2xl bg-paper/70 px-4 py-3 text-base shadow-hairline"
                    />
                  </div>
                </div>

                {!confirming && (
                  <Button
                    variant="secondary"
                    className="mt-6"
                    onClick={() => {
                      setConfirming(true);
                      requestAnimationFrame(() => scope.current?.focus());
                    }}
                  >
                    Review the scope
                  </Button>
                )}
              </>
            )}
          </div>
        </Step>
      )}

      {role && subject && confirming && (
        <Step number={4} title="Confirm the scope">
          <div ref={scope} tabIndex={-1} className="outline-none">
            <form action={action}>
              <input type="hidden" name="role" value={role} />
              <input type="hidden" name="subjectId" value={subject.id} />
              <input type="hidden" name="stages" value={values.stages} />
              <input type="hidden" name="sectors" value={values.sectors} />
              <input type="hidden" name="geographies" value={values.geographies} />
              <input type="hidden" name="exclusions" value={exclusions} />
              <input type="hidden" name="notes" value={notes} />
              {backers && <input type="hidden" name="includeExistingBackers" value="on" />}
              {publicFunding && <input type="hidden" name="includePublicFunding" value="on" />}

              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-3">Engagement</dt>
                  <dd className="mt-0.5">
                    {MANDATE_LABEL[role]} for <strong className="font-demi">{subject.name}</strong>, as Slush preparation.
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">Criteria</dt>
                  <dd className="mt-0.5 flex flex-col gap-1">
                    {FIELDS.map(({ name }) => (
                      <span key={name} className="flex flex-wrap items-center gap-2">
                        <span>
                          {LABELS[role][name].label}: {values[name].trim() || "not given"}
                        </span>
                        <EvidenceTag kind={kindOf(name)} />
                      </span>
                    ))}
                    {exclusions.trim() && <span>Ruled out: {exclusions.trim()}</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">Coverage</dt>
                  <dd className="mt-0.5">
                    What is stored, at once. Then one first pass of at most 25 requests to Cala, at most 6 of them signal probes, while Cala
                    answers.
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-3">You get</dt>
                  <dd className="mt-0.5">
                    A ranked Book where every entry shows its trails or says &ldquo;direct fit only&rdquo;. 3 full briefs where the evidence
                    permits, and a gap report where it does not. 1 meeting packet and 1 revision.
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-ink-3">You do not get</dt>
                  <dd className="mt-0.5">
                    Introductions, booked meetings or a fundraising outcome. A trail is a sourced connection, not an introduction. A signal is
                    a reason to ask, not proof of appetite.
                  </dd>
                </div>
              </dl>

              {state.error && (
                <p role="alert" className="mt-5 rounded-2xl bg-orange-tint px-4 py-3 text-sm">
                  {state.error}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button type="submit" size="large" disabled={pending}>
                  {pending ? "Opening the mandate" : "Hire Cabala"}
                </Button>
                <p className="text-meta text-ink-3">No payment and no login. The mandate stays with this browser.</p>
              </div>
            </form>
          </div>
        </Step>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-ink" />
      <span>{children}</span>
    </label>
  );
}

/** One search result. Duplicates look alike, so the end of the Cala ID is shown to tell them apart. */
function Match({ match }: { match: EntityMatch }) {
  return (
    <span className="block min-w-0">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-demi tracking-tight">{match.name}</span>
        <span className="text-meta text-ink-3">{match.entityType}</span>
        <span className="font-mono text-[0.6875rem] text-ink-3">…{match.id.slice(-8)}</span>
      </span>
      <span className="mt-0.5 block text-sm text-ink-2">{match.description ?? "No description stored."}</span>
      <span className="mt-1.5 flex flex-wrap gap-1.5 text-[0.6875rem] font-medium">
        <span className={`rounded-full px-2 py-0.5 ${match.stored ? "bg-blue-tint" : "outline outline-1 -outline-offset-1 outline-dotted outline-ink/50"}`}>
          {match.stored ? "Read in full" : "Not read yet"}
        </span>
        {match.slushAttendee && <span className="rounded-full bg-yellow-tint px-2 py-0.5">On Cala&rsquo;s Slush 2026 list</span>}
      </span>
    </span>
  );
}
