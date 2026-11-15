import type { Db } from "./db";
import type { Ledger } from "./contract";
import type { Research } from "./research";

export const CONTINUATION_CEILING = 25;
/** Server-only orchestration. No session or model is created by a scheduled pass. */
export function createContinuation(db: Db, research: Research) {
  const workMandate: Ledger["workMandate"] = async (id, owner, options) => {
    // Ownership is verified before attempting the shared claim.
    const claimed = await db.query<{ id: string }>(
      `update mandates set continuing_since = clock_timestamp()
       where id = $1 and owner_id = $2 and continuing_since is null returning id`, [id, owner]);
    if (!claimed.length) throw new Error("Mandate unavailable or research already running.");
    try { return await research.workMandate(id, owner, options); }
    finally { await db.query("update mandates set continuing_since = null where id = $1", [id]); }
  };
  async function continueMandates() {
    if (process.env.CABALA_CONTINUATION_ENABLED !== "1") return { enabled: false, passes: 0 };
    const candidates = await db.query<{ id: string; owner_id: string }>(
      `select id, owner_id from mandates where open and stage <> 'brief_received'
       and continuing_since is null and requests_spent < $1 order by created_at limit 5`, [CONTINUATION_CEILING]);
    let passes = 0;
    for (const candidate of candidates) {
      // Reserve the remaining ceiling atomically. On error it stays charged conservatively.
      const [claim] = await db.query<{ remaining: number }>(
        `update mandates set continuing_since = clock_timestamp(), requests_spent = $2
         where id = $1 and open and continuing_since is null and requests_spent < $2
         returning $2 - (select requests_spent from mandates where id = $1) as remaining`,
        [candidate.id, CONTINUATION_CEILING]);
      if (!claim) continue;
      try {
        // Worker loads the latest revision only after the claim is held.
        const result = await research.continueMandate(candidate.id, candidate.owner_id, claim.remaining);
        await db.query(`update mandates set requests_spent = requests_spent - $2 + $3,
          open = open and $3 > 0, continuing_since = null where id = $1`,
          [candidate.id, claim.remaining, result.requestsUsed]);
        passes++;
      } catch (error) {
        await db.query("update mandates set continuing_since = null where id = $1", [candidate.id]);
        console.error("Continuation pass failed", candidate.id, error);
      }
    }
    return { enabled: true, passes };
  }
  return { workMandate, continueMandates };
}
