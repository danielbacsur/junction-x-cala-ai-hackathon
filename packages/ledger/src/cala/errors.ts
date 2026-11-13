import { CalaUnavailableError } from "../contract";

/**
 * One request failed for a reason of its own: Cala answered with an error status, or gave no
 * answer at all. Status is null when there was no HTTP answer. It is not retried.
 */
export class CalaRequestError extends Error {
  override name = "CalaRequestError";
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);

    this.status = status;
  }
}

/** Cala kept answering 429 after the bounded retries. */
export class CalaRateLimitError extends CalaRequestError {
  override name = "CalaRateLimitError";
}

/** No answer inside the time one request is given. */
export class CalaTimeoutError extends CalaRequestError {
  override name = "CalaTimeoutError";
}

/**
 * No key is left to send with: none was configured, or Cala refused each one. Callers that fall
 * back to stored evidence when Cala is unavailable do the same here, so it extends that error.
 */
export class CalaKeyError extends CalaUnavailableError {
  override name = "CalaKeyError";
}
