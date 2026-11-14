import type { EvidenceKind } from "@fundraising/package-ledger";

const KIND: Record<EvidenceKind, { label: string; className: string; hint: string }> = {
  observed: {
    label: "Observed",
    className: "bg-blue-tint text-ink",
    hint: "Stated by a source Cala cites.",
  },
  inferred: {
    label: "Inferred",
    className: "bg-lilac-tint text-ink outline outline-1 -outline-offset-1 outline-dashed outline-ink/40",
    hint: "Cabala's reading of the evidence. It is not in a source.",
  },
  unknown: {
    label: "Still unknown",
    className: "text-ink-2 outline outline-1 -outline-offset-1 outline-dotted outline-ink/50",
    hint: "Not in the stored evidence. It is not a negative finding.",
  },
  self_reported: {
    label: "Self-reported",
    className: "bg-orange-tint text-ink",
    hint: "Supplied by you. Not checked against a source.",
  },
};

/** One glyph per kind, so the four never rest on colour alone. */
function Glyph({ kind }: { kind: EvidenceKind }) {
  return (
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
      {kind === "observed" && <circle cx="5" cy="5" r="3.6" fill="currentColor" />}
      {kind === "inferred" && <path d="M5 0.8 9.2 5 5 9.2 0.8 5Z" fill="currentColor" />}
      {kind === "unknown" && <circle cx="5" cy="5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />}
      {kind === "self_reported" && (
        <path d="M5 4.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM1.2 9.4c.3-2 1.8-3.3 3.8-3.3s3.5 1.3 3.8 3.3Z" fill="currentColor" />
      )}
    </svg>
  );
}

/**
 * How a statement is known. Observed, Inferred, Still unknown and Self-reported look different
 * everywhere they appear: by label, by glyph and by fill or outline.
 */
export function EvidenceTag({ kind, className = "" }: { kind: EvidenceKind; className?: string }) {
  const { label, className: look, hint } = KIND[kind];

  return (
    <span
      title={hint}
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[0.6875rem] leading-none font-medium tracking-wide whitespace-nowrap ${look} ${className}`}
    >
      <Glyph kind={kind} />
      {label}
    </span>
  );
}

export const evidenceLabel = (kind: EvidenceKind) => KIND[kind].label;
