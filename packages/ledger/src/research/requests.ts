import type { CalaRequest } from "../cala/contract";

/** The Slush 2026 event in Cala's graph. Its incoming participants are the cohort. */
export const SLUSH_EVENT_ID = "bc844d56-6ab4-452b-96bf-2661e86e592b";

const properties = [
  "name",
  "legal_name",
  "aliases",
  "description",
  "website",
  "headquarters_address",
  "founding_date",
  "employee_count_range",
  "funding_stage",
  "total_funding",
  "total_funding_units",
  "operational_status",
];

const outgoing = [
  "INVESTED_IN",
  "PARTICIPATES_IN_FUNDING_ROUND",
  "PARTICIPATES_IN_CORPORATE_EVENT",
  "PARTICIPATES_IN_EVENT",
  "OPERATES_IN_INDUSTRY",
  "HAS_HEADQUARTERS_IN",
  "IS_REGISTERED_IN",
  "IS_SUBSIDIARY_OF",
  "IS_DIRECT_PARENT_OF",
  "IS_ULTIMATE_PARENT_OF",
  "IS_BENEFICIARY_OWNER_OF",
  "IS_MEMBER_OF",
  "HAS_DOMAIN_NAME",
  "HAS_PRESENCE_IN",
  "TRADED_ON",
  "LISTED_ON",
];

const incoming = [
  "INVESTED_IN",
  "FOUNDED",
  "WORKS_AT",
  "IS_MEMBER_OF",
  "IS_CEO_OF",
  "IS_CTO_OF",
  "IS_CFO_OF",
  "IS_COO_OF",
  "IS_EXECUTIVE_OF",
  "IS_BOARD_MEMBER_OF",
  "IS_VICEPRESIDENT_OF",
  "IS_SUBSIDIARY_OF",
  "IS_DIRECT_PARENT_OF",
  "IS_ULTIMATE_PARENT_OF",
  "IS_BENEFICIARY_OWNER_OF",
  "MANUFACTURED_BY",
  "DESIGNED_BY",
  "OPERATED_BY",
  "CREATED_BY",
  "PUBLISHED_BY",
  "GRANTED_BY",
  "PARTICIPATES_IN_FUNDING_ROUND",
];

/** Names the mentors have not confirmed. An entity that lacks them returns empty lists at no cost. */
const candidates = [
  "HAS_CUSTOMER",
  "IS_CUSTOMER_OF",
  "IS_PARTNER_OF",
  "PARTNERS_WITH",
  "IS_SUPPLIER_OF",
  "ACQUIRED",
  "HAS_CONTRACT_WITH",
  "AWARDED_CONTRACT",
];

const wide = new Set(["INVESTED_IN", "PARTICIPATES_IN_FUNDING_ROUND", "PARTICIPATES_IN_CORPORATE_EVENT"]);

function limits(names: string[], limit: (name: string) => number) {
  return Object.fromEntries(names.map((name) => [name, { limit: limit(name) }]));
}

/**
 * The star read of consensus point 5.2, key for key as evidence-round-6-fable/star-body-v2.json,
 * so a request built here has the ID of the saved one.
 */
export const starBody = {
  properties,
  relationships: {
    outgoing: limits([...outgoing, ...candidates], (name) => (wide.has(name) ? 1000 : 200)),
    incoming: limits([...incoming, ...candidates], (name) =>
      wide.has(name) ? 1000 : name === "IS_BENEFICIARY_OWNER_OF" ? 50 : 200,
    ),
  },
};

/** The narrower star read of evidence-round-4-fable/star-body.json, the fallback when a wide read fails. */
export const narrowStarBody = {
  properties,
  relationships: {
    outgoing: limits(outgoing, () => 200),
    incoming: limits(incoming, () => 200),
  },
};

/** evidence-round-4-fable/person-body.json. */
export const personBody = {
  properties: ["name", "description", "linkedin_url"],
  relationships: {
    outgoing: limits(
      [
        "FOUNDED",
        "WORKS_AT",
        "IS_BOARD_MEMBER_OF",
        "IS_CEO_OF",
        "IS_CTO_OF",
        "IS_CFO_OF",
        "IS_COO_OF",
        "IS_EXECUTIVE_OF",
        "INVESTED_IN",
        "IS_MEMBER_OF",
        "STUDIED_AT",
        "SPOKE_AT",
        "RECEIVED_AWARD",
        "IS_BENEFICIARY_OWNER_OF",
        "PARTICIPATES_IN_FUNDING_ROUND",
        "HAS_NATIONALITY",
      ],
      () => 200,
    ),
    incoming: {},
  },
};

/** evidence-round-4-fable/round-body.json. */
export const roundBody = {
  properties: [
    "name",
    "description",
    "round_label",
    "round_type",
    "transaction_value",
    "transaction_value_units",
    "announcement_date",
    "close_date",
    "instrument",
    "event_date",
    "event_type",
  ],
  relationships: {
    incoming: {
      PARTICIPATES_IN_FUNDING_ROUND: { limit: 100 },
      PARTICIPATES_IN_CORPORATE_EVENT: { limit: 100 },
    },
    outgoing: {},
  },
};

/** One page of an event's participants. The Slush roster is three of these. */
export function rosterBody(offset: number) {
  return {
    properties: ["name", "description", "event_date", "location"],
    relationships: {
      incoming: { PARTICIPATES_IN_EVENT: offset ? { limit: 1000, offset } : { limit: 1000 } },
      outgoing: {},
    },
  };
}

export function starRequest(entityId: string, entityType?: string | null): CalaRequest {
  return { kind: "entity", entityId, body: entityType === "Person" ? personBody : starBody };
}

export function roundRequest(roundId: string): CalaRequest {
  return { kind: "entity", entityId: roundId, body: roundBody };
}

export function rosterRequest(offset: number, eventId = SLUSH_EVENT_ID): CalaRequest {
  return { kind: "entity", entityId: eventId, body: rosterBody(offset) };
}

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The one fixed question of a signal probe (consensus point 5.5). */
export function probeQuestion(name: string, hint: string | null, since: Date): string {
  const subject = hint ? `${name} (${hint})` : name;
  const date = `${months[since.getUTCMonth()]} ${since.getUTCFullYear()}`;

  return `Which government contracts, public grants or public funding agreements, partnerships and customer agreements has ${subject} announced since ${date}? For each give the counterparty, date, type and value.`;
}

export function probeRequest(question: string): CalaRequest {
  return { kind: "knowledge_search", input: question };
}

type SavedRequest = { method?: string; path?: string; body?: unknown };

/** A fixture's saved `_request` as the CalaRequest the live client would build for it. */
export function fromSavedRequest(saved: SavedRequest): CalaRequest | null {
  const method = (saved.method ?? "GET").toUpperCase();
  const [path = "", query = ""] = (saved.path ?? "").split("?");
  const body = saved.body as Record<string, unknown> | null | undefined;

  if (method === "POST" && path === "/knowledge/search" && typeof body?.input === "string") {
    return { kind: "knowledge_search", input: body.input };
  }

  if (method === "POST" && path === "/knowledge/query" && typeof body?.input === "string") {
    return { kind: "knowledge_query", input: body.input };
  }

  if (method === "POST" && path === "/entities/lookup") {
    const [scheme, value] = Object.entries((body?.id ?? {}) as Record<string, unknown>)[0] ?? [];

    return scheme && typeof value === "string" ? { kind: "lookup", scheme, value } : null;
  }

  if (method === "POST" && path.startsWith("/entities/")) {
    return { kind: "entity", entityId: path.slice("/entities/".length), body: body ?? {} };
  }

  if (method === "GET" && path === "/entities") {
    const params = new URLSearchParams(query);
    const name = params.get("name");
    const types = params.get("entity_types");
    const limit = params.get("limit");

    if (!name) return null;

    return {
      kind: "search_entities",
      name,
      ...(types ? { types: types.split(",") } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    };
  }

  return null;
}
