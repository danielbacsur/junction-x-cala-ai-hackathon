import type { RelationFamily } from "../contract";

/**
 * Which Cala relationship belongs to which family, and whether trails may walk it (consensus
 * point 16.3). It is data, so a type the mentors name is one added row.
 */
export type Relation = {
  type: string;
  /** "membership" is shown as context and never walked; "context" covers place, industry and the like. */
  family: RelationFamily | "membership" | "context";
  traversed: boolean;
  /** How the hop is named when a trail walks it from target to source. */
  inverse?: string;
};

export const relations: Relation[] = [
  { type: "INVESTED_IN", family: "investment", traversed: true },

  { type: "IS_SUBSIDIARY_OF", family: "ownership", traversed: true, inverse: "HAS_SUBSIDIARY" },
  { type: "IS_DIRECT_PARENT_OF", family: "ownership", traversed: true, inverse: "HAS_DIRECT_PARENT" },
  { type: "IS_ULTIMATE_PARENT_OF", family: "ownership", traversed: true, inverse: "HAS_ULTIMATE_PARENT" },
  { type: "IS_BENEFICIARY_OWNER_OF", family: "ownership", traversed: true, inverse: "HAS_BENEFICIARY_OWNER" },

  { type: "FOUNDED", family: "person", traversed: true, inverse: "FOUNDED_BY" },
  { type: "WORKS_AT", family: "person", traversed: true, inverse: "EMPLOYS" },
  { type: "IS_CEO_OF", family: "person", traversed: true, inverse: "HAS_CEO" },
  { type: "IS_CTO_OF", family: "person", traversed: true, inverse: "HAS_CTO" },
  { type: "IS_CFO_OF", family: "person", traversed: true, inverse: "HAS_CFO" },
  { type: "IS_COO_OF", family: "person", traversed: true, inverse: "HAS_COO" },
  { type: "IS_CSO_OF", family: "person", traversed: true, inverse: "HAS_CSO" },
  { type: "IS_EXECUTIVE_OF", family: "person", traversed: true, inverse: "HAS_EXECUTIVE" },
  { type: "IS_VICEPRESIDENT_OF", family: "person", traversed: true, inverse: "HAS_VICEPRESIDENT" },
  { type: "IS_BOARD_MEMBER_OF", family: "person", traversed: true, inverse: "HAS_BOARD_MEMBER" },

  { type: "IS_MEMBER_OF", family: "membership", traversed: false },
];

const byType = new Map(relations.map((relation) => [relation.type, relation]));

/** The family of a Cala relationship. Anything not in the table is context and is never walked. */
export function familyOf(type: string): Relation["family"] {
  return byType.get(type)?.family ?? "context";
}

export function inverseOf(type: string): string {
  return byType.get(type)?.inverse ?? type;
}

/** Board seats are person edges. An appointment is a board change and never a change of control. */
export const boardRelationships = new Set(["IS_BOARD_MEMBER_OF"]);

export const ownershipRelationships = relations
  .filter((relation) => relation.family === "ownership")
  .map((relation) => relation.type);

/** Roles that put money into a round or financing event, and roles that receive it. */
export const financierRoles = ["INVESTOR", "GRANTOR", "LENDER"];
export const recipientRoles = ["ISSUER", "BORROWER"];

/** Entity types that are rounds or events and not parties. */
export const roundTypes = new Set(["FundingRound", "PrivateCompanyFundingRound", "CorporateEvent"]);

/** Corporate event names that are financings, and those that are filed events (point 16.4). */
export const FINANCING_EVENT = "FINANCING_RAISED_OR_FACILITY_ENTERED";
export const filedEvents = new Set([
  "MATERIAL_AGREEMENT_ANNOUNCED",
  "MANAGEMENT_OR_BOARD_CHANGE",
  "LISTING_STATUS_CHANGE",
]);
