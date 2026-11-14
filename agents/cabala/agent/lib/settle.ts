import { NotFoundError } from "@fundraising/package-ledger";
import { FatalError } from "eve/workflow";

/**
 * Awaits a ledger call made from a workflow step. A missing or foreign record is still missing on
 * a retry, so it fails the call at once instead of being retried.
 */
export async function settle<T>(work: Promise<T>) {
  try {
    return await work;
  } catch (error) {
    throw error instanceof NotFoundError ? new FatalError(error.message) : error;
  }
}
