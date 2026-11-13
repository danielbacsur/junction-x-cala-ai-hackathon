export type Call = {
  url: string;
  method: string;
  body: unknown;
  /** The key the request carried, so tests can tell which one was used. */
  key: string;
  /** The fake clock's time when the request started. */
  at: number;
  signal: AbortSignal | null;
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** The page Cala's load balancer answered with during the outage of 14 November. */
export function refusal(): Response {
  const page = [
    "<html>",
    "<head><title>403 Forbidden</title></head>",
    "<body>",
    "<center><h1>403 Forbidden</h1></center>",
    "</body>",
    "</html>",
    "",
  ].join("\r\n");

  return new Response(page, { status: 403, headers: { "content-type": "text/html", server: "awselb/2.0" } });
}

/** An answer that never comes, for timeouts. */
export function never(): Promise<Response> {
  return new Promise(() => {});
}

/** An answer that takes time on the fake clock, so that other requests are sent before it lands. */
export function after(milliseconds: number, response: Response): Promise<Response> {
  return new Promise((resolve) => setTimeout(() => resolve(response), milliseconds));
}

type Reply = (call: Call, index: number) => Response | Promise<Response>;

/** A fetch that records every call and answers with whatever the test decides. */
export function fakeCala(reply: Reply = () => json({ ok: true })) {
  const calls: Call[] = [];

  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      key: new Headers(init.headers).get("x-api-key") ?? "",
      at: Date.now(),
      signal: init.signal ?? null,
    };

    calls.push(call);

    const aborted = new Promise<never>((_, reject) => {
      const abort = () => reject(new DOMException("This operation was aborted", "AbortError"));

      call.signal?.addEventListener("abort", abort);
    });

    return Promise.race([reply(call, calls.length - 1), aborted]);
  }) as typeof globalThis.fetch;

  return { calls, fetch };
}

/** The error a promise rejects with. */
export async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }

  throw new Error("The promise was expected to reject.");
}

/** How a promise ended, without throwing, so a test can advance the clock before it looks. */
export function outcome<Value>(promise: Promise<Value>): Promise<{ value?: Value; error?: unknown }> {
  return promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
}
