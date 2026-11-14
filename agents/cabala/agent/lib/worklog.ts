import type { EntityRef, WorkEvent } from "@fundraising/package-ledger";

/**
 * One line for the mandate's work log, which the web app shows without parsing the chat. Tool code
 * writes these; the model never does. A key names the step that writes the line, so that a retried
 * workflow step returns the line it already wrote instead of adding another.
 */
export function line(
  message: string,
  options: { entity?: EntityRef | null; kind?: WorkEvent["kind"]; key?: string } = {},
): Omit<WorkEvent, "id" | "mandateId" | "at"> & { key?: string } {
  return {
    kind: options.kind ?? "note",
    message,
    seconds: null,
    entity: options.entity ?? null,
    fromStore: false,
    ...(options.key && { key: options.key }),
  };
}
