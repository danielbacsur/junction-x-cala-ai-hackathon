import { type Book, type Brief, type EntityRef, type Mandate, NotFoundError } from "../../src/contract";
import { createPrivateStore } from "../../src/private";
import { memoryDb } from "../db";
import { enova, iceye, kuvaBrief, kuvaSpace, redpine, redpineBrief } from "./fixtures";

/** A stand-in for the research engine. It remembers what it was asked to rank. */
export function fakeResearch() {
  const subjects = new Map([redpine, iceye].map((subject) => [subject.id, subject]));
  const briefs = new Map([
    [enova.id, redpineBrief],
    [kuvaSpace.id, kuvaBrief],
  ]);

  const ranked: Mandate[] = [];
  const counts = { trails: 2, sources: 3 };

  return {
    ranked,
    counts,

    async entityRef(entityId: string): Promise<EntityRef> {
      const subject = subjects.get(entityId);

      if (!subject) throw new NotFoundError("Entity not found.");

      return subject;
    },

    async rank(mandate: Mandate): Promise<void> {
      ranked.push(mandate);
    },

    async readBook(): Promise<Book> {
      return {
        mandate: ranked.at(-1)!,
        rows: [],
        gaps: [],
        coverage: {
          rosterSize: 0,
          rosterFetchedAt: null,
          entitiesReadInFull: 0,
          hubsRead: 0,
          probesStored: 0,
          cala: "latched",
          calaCheckedAt: null,
          newestFetchAt: null,
        },
      };
    },

    async getBrief(mandateId: string, _ownerId: string, candidateId: string): Promise<Brief> {
      const brief = briefs.get(candidateId);

      if (!brief) throw new NotFoundError("Candidate not found.");

      return brief(mandateId, ranked.filter((mandate) => mandate.id === mandateId).at(-1)?.revision ?? 1);
    },

    async evidenceCounts() {
      return counts;
    },
  };
}

export async function privateStore() {
  const db = await memoryDb();
  const research = fakeResearch();

  return { db, research, store: createPrivateStore({ db, research }) };
}
