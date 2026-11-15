"use client";

import type { Packet } from "@fundraising/package-ledger";
import { useActionState, useId, useState, type ReactNode } from "react";

import { approveVersion, saveVersion, type PacketState } from "@/app/m/[id]/packet/[version]/actions";
import { Button, buttonClass } from "@/components/ui/button";

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-heading">{title}</h2>
      {note && <p className="mt-0.5 text-meta text-ink-3">{note}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Field({ name, label, rows, defaultValue, note }: { name: string; label: string; rows: number; defaultValue: string; note?: string }) {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="text-sm font-demi">
        {label}
      </label>
      {note && <p className="text-meta text-ink-3">{note}</p>}
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="mt-1.5 block w-full rounded-2xl bg-paper/70 px-4 py-3 text-base leading-relaxed shadow-hairline"
      />
    </div>
  );
}

/**
 * One packet version, to read or to edit. Saving never changes this version: it makes the next
 * one, after the ledger's checks have taken out what the evidence cannot carry. Approval is for
 * exactly the version on screen.
 */
export function PacketEditor({ packet, latest, trail }: { packet: Packet; latest: boolean; trail: ReactNode }) {
  const [editing, setEditing] = useState(false);

  const [saved, save, saving] = useActionState<PacketState, FormData>(saveVersion.bind(null, packet.mandateId, packet.version), { error: null });
  const [approved, approve, approving] = useActionState<PacketState>(() => approveVersion(packet.mandateId, packet.version), { error: null });

  const { sections } = packet;
  const editable = latest;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <article data-print="plain" className="rounded-panel bg-card p-5 shadow-hairline sm:p-8">
        {editing ? (
          <form action={save} className="grid gap-5">
            <Field name="whyMeet" label="Why meet" rows={5} defaultValue={sections.whyMeet} />
            <Field name="trail" label="The trail behind it" rows={5} defaultValue={sections.trail} />
            <Field name="whyHesitate" label="Why hesitate" rows={5} defaultValue={sections.whyHesitate} />
            <Field name="questions" label="Questions" rows={4} defaultValue={sections.questions.join("\n")} note="One per line." />
            <Field name="agenda" label="Agenda" rows={4} defaultValue={sections.agenda.join("\n")} note="One per line." />
            <Field name="outreachDraft" label="Outreach draft" rows={5} defaultValue={sections.outreachDraft} />
            <Field
              name="privateNotes"
              label="Private notes"
              rows={3}
              defaultValue={sections.privateNotes}
              note="Only you see these. They are never checked, exported or printed."
            />

            {saved.error && (
              <p role="alert" className="rounded-2xl bg-orange-tint px-4 py-3 text-sm">
                {saved.error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Checking and saving" : `Check and save as version ${packet.version + 1}`}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Discard changes
              </Button>
            </div>
            <p className="text-meta text-ink-3">
              Every sentence is checked against the stored evidence. A sentence it cannot carry is taken out and listed with the reason. The
              new version is a draft and needs its own approval.
            </p>
          </form>
        ) : (
          <div className="grid gap-5 text-base leading-relaxed">
            <Section title="Why meet">
              <p className="whitespace-pre-line">{sections.whyMeet || "Nothing written."}</p>
            </Section>

            <Section title="The trail behind it">
              <p className="whitespace-pre-line">{sections.trail || "Nothing written."}</p>
              <div className="mt-4">{trail}</div>
            </Section>

            <Section title="Why hesitate">
              <p className="whitespace-pre-line">{sections.whyHesitate || "Nothing written."}</p>
            </Section>

            <Section title="Questions">
              <ol className="list-decimal space-y-1 pl-5">
                {sections.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </Section>

            <Section title="Agenda">
              <ol className="list-decimal space-y-1 pl-5">
                {sections.agenda.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </Section>

            <Section title="Outreach draft" note="A draft for you to send yourself. Cabala sends nothing.">
              <p className="rounded-2xl bg-paper/60 px-4 py-3 whitespace-pre-line" data-print="plain">
                {sections.outreachDraft || "Nothing written."}
              </p>
            </Section>

            <div data-print="hide">
              <Section title="Private notes" note="Only you see these. They are never exported or printed.">
                <p className="whitespace-pre-line text-ink-2">{sections.privateNotes || "None."}</p>
              </Section>
            </div>
          </div>
        )}
      </article>

      <aside data-print="hide" className="grid gap-4">
        <section aria-label="Decide" className="rounded-card bg-card p-5 shadow-hairline">
          {packet.status === "approved" ? (
            <p className="text-sm">
              <strong className="font-demi">Approved.</strong> This exact version is the one you signed off. An edit makes a new version, which
              this approval does not cover.
            </p>
          ) : packet.status === "superseded" ? (
            <p className="text-sm">
              <strong className="font-demi">Superseded.</strong> A newer version exists. This one can be read and exported, not approved.
            </p>
          ) : (
            <form action={approve}>
              <p className="text-sm text-ink-2">Approval covers this version and no other.</p>
              <Button type="submit" className="mt-3 w-full" disabled={approving || editing}>
                {approving ? "Approving" : `Approve version ${packet.version}`}
              </Button>
              {approved.error && (
                <p role="alert" className="mt-3 rounded-2xl bg-orange-tint px-4 py-3 text-sm">
                  {approved.error}
                </p>
              )}
            </form>
          )}

          {editable && !editing && (
            <Button variant="secondary" className="mt-3 w-full" onClick={() => setEditing(true)}>
              Edit, as a new version
            </Button>
          )}
        </section>

        <section aria-label="Export" className="rounded-card bg-card p-5 shadow-hairline">
          <h2 className="text-sm font-demi">Export</h2>
          <div className="mt-3 grid gap-2">
            <a href={`/m/${packet.mandateId}/packet/${packet.version}/export`} download className={buttonClass({ variant: "secondary" })}>
              Download as Markdown
            </a>
            <Button variant="secondary" onClick={() => window.print()} disabled={editing}>
              Print, or save as PDF
            </Button>
          </div>
          <p className="mt-3 text-meta text-ink-3">Both leave out your private notes. {packet.status !== "approved" && "This version is not approved."}</p>
        </section>
      </aside>
    </div>
  );
}
