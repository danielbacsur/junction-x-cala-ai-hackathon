import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { CalaRequest } from "../cala/contract";
import { requestId } from "../cala/id";
import type { AgreementExtractor, ExtractedAgreement } from "../contract";
import type { IngestInput } from "./ingest";
import { fromSavedRequest, rosterRequest } from "./requests";

const fixtures = fileURLToPath(new URL("../../fixtures/", import.meta.url));

type Manifest = {
  approximateFetchedAt: string;
  notResponses: Record<string, string>;
  skip: Record<string, string>;
  reconstructed: Record<string, { kind: "entity" | "roster"; full?: boolean; note: string }>;
  probes: Record<string, { subjectId: string; extraction?: string }>;
};

type Wrapped = {
  _request: { method?: string; path?: string; body?: unknown };
  _fetched_at?: string | null;
  _seconds?: number | null;
  _http_error?: number;
  response?: unknown;
};

async function readJson<Value>(path: string): Promise<Value> {
  return JSON.parse(await readFile(path, "utf8")) as Value;
}

/** The saved clock time, such as 2026-11-14T12:23:56+0200, as an ISO instant. */
function instant(saved: string): string {
  return new Date(saved.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).toISOString();
}

function input(request: CalaRequest, fetchedAt: string, seconds: number, body: unknown, rest: Partial<IngestInput>) {
  return { id: requestId(request), request, status: 200, fetchedAt, seconds, body, fromStore: true, ...rest };
}

/**
 * Loads the committed fixtures into the store through ingest, oldest first, so a later read of
 * the same entity wins. Files that hold no usable response are returned with the reason.
 */
export async function importFixtures(
  research: { ingest(response: IngestInput): Promise<void> },
  directory = fixtures,
): Promise<{ files: number; skipped: string[] }> {
  const manifest = await readJson<Manifest>(`${directory}/manifest.json`);
  const approximate = new Date(manifest.approximateFetchedAt).toISOString();
  const inputs: IngestInput[] = [];
  const skipped: string[] = [];
  let files = 0;

  const folders = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("evidence-"))
    .map((entry) => entry.name)
    .sort();

  for (const folder of folders) {
    for (const name of (await readdir(`${directory}/${folder}`)).filter((file) => file.endsWith(".json")).sort()) {
      const fixture = `${folder}/${name}`;

      if (manifest.notResponses[fixture]) continue;

      if (manifest.skip[fixture]) {
        skipped.push(`${fixture}: ${manifest.skip[fixture]}`);

        continue;
      }

      const saved = await readJson<Wrapped & Record<string, unknown>>(`${directory}/${fixture}`);
      const rebuilt = manifest.reconstructed[fixture];

      if (rebuilt?.kind === "roster") {
        const header = await readJson<Record<string, unknown>>(`${directory}/${folder}/event-slush-1000.json`);
        const participants = saved as unknown as unknown[];

        for (let offset = 0; offset < participants.length; offset += 1000) {
          inputs.push(
            input(
              rosterRequest(offset, String(header.id)),
              approximate,
              0,
              {
                ...header,
                relationships: {
                  outgoing: {},
                  incoming: { PARTICIPATES_IN_EVENT: participants.slice(offset, offset + 1000) },
                },
              },
              {
                provenance: {
                  fixture,
                  note: `Page at offset ${offset}. ${rebuilt.note}`,
                  requestReconstructed: true,
                  fetchedAtApproximate: true,
                },
              },
            ),
          );
        }

        files += 1;

        continue;
      }

      if (rebuilt?.kind === "entity") {
        const entity = (saved.introspection && saved.entity ? saved.entity : saved) as { id?: string };

        if (!entity.id) {
          skipped.push(`${fixture}: no entity in the file.`);

          continue;
        }

        // The body that was sent is not known, so the request names the fixture and cannot
        // collide with a request the live client builds.
        const request: CalaRequest = {
          kind: "entity",
          entityId: entity.id,
          body: { _fixture: fixture, ...(rebuilt.full ? { _full: true } : {}) },
        };

        inputs.push(
          input(request, approximate, 0, saved, {
            provenance: { fixture, note: rebuilt.note, requestReconstructed: true, fetchedAtApproximate: true },
          }),
        );
        files += 1;

        continue;
      }

      if (!saved._request) {
        skipped.push(`${fixture}: saved without a request and not described in the manifest.`);

        continue;
      }

      if (saved._http_error || saved.response === undefined || saved.response === null || !saved._fetched_at) {
        skipped.push(`${fixture}: Cala refused this request (HTTP ${saved._http_error ?? "error"}); there is no body.`);

        continue;
      }

      const request = fromSavedRequest(saved._request);

      if (!request) {
        skipped.push(`${fixture}: the saved request is not one the client can make.`);

        continue;
      }

      inputs.push(
        input(request, instant(saved._fetched_at), saved._seconds ?? 0, saved.response, {
          provenance: { fixture },
          probeSubjectId: manifest.probes[fixture]?.subjectId ?? null,
        }),
      );
      files += 1;
    }
  }

  inputs.sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));

  for (const one of inputs) await research.ingest(one);

  return { files, skipped };
}

/**
 * An agreement extractor that answers from the hand-written readings committed beside the
 * probe fixtures. It knows only those questions and throws for any other, so it can stand in
 * for the model while fixtures are imported and in tests.
 */
export async function fixtureExtractor(directory = fixtures): Promise<AgreementExtractor> {
  const manifest = await readJson<Manifest>(`${directory}/manifest.json`);
  const byQuestion = new Map<string, ExtractedAgreement[]>();

  for (const [fixture, probe] of Object.entries(manifest.probes)) {
    if (!probe.extraction) continue;

    const saved = await readJson<Wrapped>(`${directory}/${fixture}`);
    const question = (saved._request.body as { input?: string } | null)?.input;
    const reading = await readJson<{ agreements: ExtractedAgreement[] }>(`${directory}/${probe.extraction}`);

    if (question) byQuestion.set(question, reading.agreements);
  }

  return async (answer) => {
    const agreements = byQuestion.get(answer.question);

    if (!agreements) throw new Error("No hand-written reading exists for this probe.");

    return agreements;
  };
}
