"use client";

import type { Mandate } from "@fundraising/package-ledger";
import { useActionState, useId, useState } from "react";

import { reviseScope, type ReviseState } from "@/app/m/[id]/actions";
import { Button } from "@/components/ui/button";
import { EvidenceTag } from "@/components/ui/evidence";
import { SCOPE_FIELDS, SCOPE_LABELS, joined, scopeKind, type Observed } from "@/lib/scope";

/**
 * The criteria the mandate runs on, each marked by how it is known, and the form that revises
 * them. A revision reranks the Book from the store: it reads nothing new and discovers nobody new.
 */
export function ScopePanel({ mandate, observed, onRevised }: { mandate: Mandate; observed: Observed; onRevised: () => void }) {
  const [editing, setEditing] = useState(false);
  const id = useId();

  const { constraints, role } = mandate;
  const labels = SCOPE_LABELS[role];

  const [state, action, pending] = useActionState<ReviseState, FormData>(
    async (previous, form) => {
      const next = await reviseScope(mandate.id, previous, form);

      if (!next.error) {
        setEditing(false);
        onRevised();
      }

      return next;
    },
    { error: null, revision: null },
  );

  return (
    <section aria-label="Criteria" className="rounded-card bg-card px-5 py-4 shadow-hairline">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {SCOPE_FIELDS.map(({ name }) => {
            const value = joined(constraints[name]);

            return (
              <div key={name} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <dt className="text-ink-3">{labels[name].short}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {value && <span className="font-medium">{value}</span>}
                  <EvidenceTag kind={scopeKind(value, observed[name])} />
                </dd>
              </div>
            );
          })}

          {constraints.exclusions && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <dt className="text-ink-3">Ruled out</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{joined(constraints.exclusions)}</span>
                <EvidenceTag kind="self_reported" />
              </dd>
            </div>
          )}

          {role === "founder" && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <dt className="text-ink-3">Also listed</dt>
              <dd className="font-medium">
                {[constraints.includeExistingBackers !== false && "existing backers, as follow-ups", constraints.includePublicFunding === true && "public funders"]
                  .filter(Boolean)
                  .join(" and ") || "new investors only"}
              </dd>
            </div>
          )}
        </dl>

        <Button variant="secondary" size="small" aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {editing ? "Close" : "Revise the criteria"}
        </Button>
      </div>

      {constraints.notes && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <EvidenceTag kind="self_reported" />
          <span>&ldquo;{constraints.notes}&rdquo;</span>
        </p>
      )}

      {editing && (
        <form action={action} className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          {SCOPE_FIELDS.map(({ name }) => (
            <div key={name}>
              <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
                {labels[name].label}
              </label>
              <input
                id={`${id}-${name}`}
                name={name}
                defaultValue={joined(constraints[name])}
                autoComplete="off"
                className="mt-1 block h-10 w-full rounded-full bg-paper/70 px-4 text-sm shadow-hairline"
              />
              {observed[name] && <p className="mt-1 text-[0.6875rem] text-ink-3">Cala has &ldquo;{observed[name].raw}&rdquo;.</p>}
            </div>
          ))}

          <div>
            <label htmlFor={`${id}-exclusions`} className="text-sm font-medium">
              Rule out
            </label>
            <input
              id={`${id}-exclusions`}
              name="exclusions"
              defaultValue={joined(constraints.exclusions)}
              placeholder="Names, separated by commas"
              autoComplete="off"
              className="mt-1 block h-10 w-full rounded-full bg-paper/70 px-4 text-sm shadow-hairline placeholder:text-ink-3"
            />
          </div>

          {role === "founder" && (
            <fieldset className="grid content-start gap-2 text-sm sm:col-span-2">
              <legend className="mb-1.5 font-medium">Besides new investors</legend>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" name="includeExistingBackers" defaultChecked={constraints.includeExistingBackers !== false} className="mt-0.5 size-4 accent-ink" />
                List my existing backers as follow-up targets
              </label>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" name="includePublicFunding" defaultChecked={constraints.includePublicFunding !== false} className="mt-0.5 size-4 accent-ink" />
                List public funders, as a separate non-dilutive category
              </label>
            </fieldset>
          )}

          <input type="hidden" name="notes" value={constraints.notes ?? ""} />

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" size="small" disabled={pending}>
              {pending ? "Reranking" : "Rerank the Book"}
            </Button>
            <p className="text-[0.6875rem] text-ink-3">
              Reranks what is stored, with no new reads. Packets built before this will say they rest on older criteria.
            </p>
          </div>

          {state.error && (
            <p role="alert" className="rounded-2xl bg-orange-tint px-4 py-3 text-sm sm:col-span-2">
              {state.error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
