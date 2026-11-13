import type { CalaRequest } from "./contract";

/** One HTTP answer from Cala, read to the end. The text never contains a key. */
export type Reply = { status: number; text: string; json: unknown; isJson: boolean; retryAfter: string | null };

/** How one request is sent. The saved request bodies in the evidence folders are the reference. */
export function toHttp(request: CalaRequest, baseUrl: string): { method: string; url: string; body?: string } {
  switch (request.kind) {
    case "entity":
      return {
        method: "POST",
        url: `${baseUrl}/v1/entities/${encodeURIComponent(request.entityId)}`,
        body: request.body == null ? undefined : JSON.stringify(request.body),
      };

    case "search_entities": {
      const query = new URLSearchParams({ name: request.name });

      for (const type of request.types ?? []) query.append("entity_types", type);
      if (request.limit !== undefined) query.set("limit", String(request.limit));

      return { method: "GET", url: `${baseUrl}/v1/entities?${query}` };
    }

    case "lookup":
      return {
        method: "POST",
        url: `${baseUrl}/v1/entities/lookup`,
        body: JSON.stringify({ id: { [request.scheme]: request.value } }),
      };

    case "knowledge_search":
      return { method: "POST", url: `${baseUrl}/v1/knowledge/search`, body: JSON.stringify({ input: request.input }) };

    case "knowledge_query":
      return { method: "POST", url: `${baseUrl}/v1/knowledge/query`, body: JSON.stringify({ input: request.input }) };
  }
}

/** A request in words, for error messages. */
export function label(request: CalaRequest): string {
  switch (request.kind) {
    case "entity":
      return `entity read of ${request.entityId}`;
    case "search_entities":
      return `entity search for "${request.name}"`;
    case "lookup":
      return `lookup of ${request.scheme} ${request.value}`;
    case "knowledge_search":
      return "knowledge search";
    case "knowledge_query":
      return "knowledge query";
  }
}

/** What an error body says, in one short line. */
export function describe(reply: Reply): string {
  let text = reply.text.replace(/<[^>]*>/g, " ");

  if (reply.isJson && reply.json && typeof reply.json === "object") {
    const body = reply.json as { error?: unknown; message?: unknown; detail?: unknown };
    const nested = body.error && typeof body.error === "object" ? (body.error as { message?: unknown }).message : null;
    const message = [nested, body.message, body.detail, body.error].find((part) => typeof part === "string");

    text = (message as string | undefined) ?? JSON.stringify(reply.json);
  }

  return text.replace(/\s+/g, " ").trim().slice(0, 200) || "an empty body";
}

/** Retry-After in milliseconds, whether Cala sends seconds or a date. */
export function retryAfter(header: string | null, time: number): number | null {
  if (!header) return null;
  if (/^\s*\d+(\.\d+)?\s*$/.test(header)) return Math.max(1_000, Number(header) * 1_000);

  const date = Date.parse(header);

  return Number.isNaN(date) ? null : Math.max(1_000, date - time);
}
