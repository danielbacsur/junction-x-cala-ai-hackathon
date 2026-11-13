import { readFileSync } from "node:fs";

import type { EntityRef, ProbeAnswer } from "../../src/contract";

/** A knowledge/search response as the evidence folders hold it. */
type Saved = {
  _request: { body: { input: string } };
  response: {
    explainability: { content: string; references: string[] }[] | null;
    context: { id: string; content: string; origins: { source: { name: string }; document: { url: string } }[] }[];
    entities: { id: string; name: string; entity_type: string; mentions?: string[] }[] | null;
  };
};

/** The three probes saved on 14 November, with the entity each was asked about. */
export const probes = {
  iceye: {
    file: "ksearch-iceye-gov.json",
    subject: { id: "0247c487-08b6-4e07-8e92-0969cdfeaa2d", name: "ICEYE", entityType: "Company", description: null },
  },
  kuva: {
    file: "ksearch-signal-kuva-space.json",
    subject: {
      id: "41f89a61-54ac-4068-82af-a2d2096efcfc",
      name: "Kuva Space",
      entityType: "Company",
      description: null,
    },
  },
  redpine: {
    file: "ksearch-signal-redpine.json",
    subject: {
      id: "331fec23-9c63-4885-a8f5-c2902c9e1b9d",
      name: "Redpine Technology AB",
      entityType: "Company",
      description: null,
    },
  },
} satisfies Record<string, { file: string; subject: EntityRef }>;

/** A saved probe as the extractor reads it: each claim with the passages it cites. */
export function savedProbe(name: keyof typeof probes): ProbeAnswer {
  const { file, subject } = probes[name];
  const saved = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8")) as Saved;
  const passages = new Map(saved.response.context.map((passage) => [passage.id, passage]));

  return {
    subject,
    question: saved._request.body.input,
    claims: (saved.response.explainability ?? []).map((claim, index) => ({
      index,
      text: claim.content,
      passages: claim.references.flatMap((reference) => {
        const passage = passages.get(reference);
        const origin = passage?.origins[0];

        if (!passage) return [];

        return [
          {
            text: passage.content,
            source: { name: origin?.source.name ?? null, url: origin?.document.url ?? null, date: null, rank: null },
          },
        ];
      }),
    })),
    entities: (saved.response.entities ?? []).map((entity) => ({
      id: entity.id,
      name: entity.name,
      entityType: entity.entity_type,
      mentions: entity.mentions ?? [],
    })),
  };
}
