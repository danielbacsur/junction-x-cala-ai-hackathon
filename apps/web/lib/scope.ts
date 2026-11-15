import type { Constraints, Dossier, EvidenceKind, Role, SourceRef } from "@fundraising/package-ledger";

/** The scope fields a dossier can prefill, and the property that fills each one. */
export const SCOPE_FIELDS = [
  { name: "stages", property: "funding_stage" },
  { name: "sectors", property: "industry" },
  { name: "geographies", property: "headquarters_address" },
] as const;

export type ScopeField = (typeof SCOPE_FIELDS)[number]["name"];

export const SCOPE_LABELS: Record<Role, Record<ScopeField, { label: string; short: string; hint: string }>> = {
  founder: {
    stages: { label: "Round you are raising", short: "Round", hint: "Cala knows your last round, not your next. Correct it." },
    sectors: { label: "Your sector", short: "Sector", hint: "As investors would name it." },
    geographies: { label: "Where you are based", short: "Based", hint: "Add where you want investors from, if it matters." },
  },
  investor: {
    stages: { label: "Stages you invest in", short: "Stages", hint: "Separate several with commas." },
    sectors: { label: "Sectors you invest in", short: "Sectors", hint: "Separate several with commas." },
    geographies: { label: "Where you invest", short: "Where", hint: "Separate several with commas." },
  },
};

/**
 * "SERIES_A" as people write it, also inside a list such as "FINTECH, VENTURE_CAPITAL". Cala's
 * own label stays visible beside the field.
 */
export const readable = (value: string) =>
  value
    .split(", ")
    .map((part) =>
      /^[A-Z_]+$/.test(part) ? part.toLowerCase().replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase()) : part,
    )
    .join(", ");

/** What Cala holds for each scope field: the value as shown, as stored, and its sources. */
export type Observed = Partial<Record<ScopeField, { value: string; raw: string; sources: SourceRef[] }>>;

export function observedFrom(dossier: Pick<Dossier, "properties">): Observed {
  const observed: Observed = {};

  for (const { name, property } of SCOPE_FIELDS) {
    const found = dossier.properties.find((candidate) => candidate.name === property);

    if (found) observed[name] = { value: readable(found.value), raw: found.value, sources: found.sources };
  }

  return observed;
}

/**
 * How one scope value is known. It is Observed only while it is exactly what Cala holds; anything
 * the customer typed instead is Self-reported, and nothing at all is Still unknown.
 */
export function scopeKind(value: string | null | undefined, observed: Observed[ScopeField]): EvidenceKind {
  const typed = value?.trim();

  if (!typed) return "unknown";

  return observed?.value === typed ? "observed" : "self_reported";
}

/** A list field as the one line it is edited in. */
export const joined = (items: string[] | null) => (items ?? []).join(", ");

/** "Seed, Series A" as a list. Nothing typed stays unknown, which is not the same as an empty list. */
export function listOf(value: FormDataEntryValue | string | null): string[] | null {
  const items = String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? items : null;
}

/** Reads the scope out of a submitted form. Only a founder is asked the two yes-or-no questions. */
export function constraintsFrom(form: FormData, role: Role): Constraints {
  return {
    stages: listOf(form.get("stages")),
    sectors: listOf(form.get("sectors")),
    geographies: listOf(form.get("geographies")),
    exclusions: listOf(form.get("exclusions")),
    includeExistingBackers: role === "founder" ? form.get("includeExistingBackers") === "on" : null,
    includePublicFunding: role === "founder" ? form.get("includePublicFunding") === "on" : null,
    notes: String(form.get("notes") ?? "").trim() || null,
  };
}
