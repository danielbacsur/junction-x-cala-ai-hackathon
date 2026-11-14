import type { EntityRef, WorkEvent } from "@fundraising/package-ledger";

/**
 * One line for the mandate's work log, which the web app shows without parsing the chat. Tool code
 * writes these; the model never does.
 */
export function line(
  message: string,
  entity: EntityRef | null = null,
  kind: WorkEvent["kind"] = "note",
): Omit<WorkEvent, "id" | "mandateId" | "at"> {
  return { kind, message, seconds: null, entity, fromStore: false };
}
