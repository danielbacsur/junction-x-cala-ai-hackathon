# Cabala — development notes

[Back to the overview](../README.md)

Setup, implementation details and research notes. File paths and commands are relative to the repository root.

## Layout and local use

- `apps/web`: Next.js interface, signed guest ownership, sentence intake, recommendation room and full Desk.
- `agents/cabala`: eve agent, packet writer, second read and scheduled continuation handler.
- `packages/ledger`: Cala client, public graph, private mandates, ranking and migrations.

Use Node 24+ and npm 11+. Run `npm ci`, then `npm run dev`. Configure `DATABASE_URL`, Cala keys supported by `calaKeysFromEnv`, and the eve/model configuration for your deployment. Never commit credentials. Apply all `packages/ledger/sql` migrations using the ledger admin `migrate` function before serving the app. `npm run typecheck`, `npm test` and `npm run lint` provide local checks.

## Bounded continuing research

`agent/schedules/continue.ts` runs every fifteen minutes in a built eve deployment. It performs no work unless `CABALA_CONTINUATION_ENABLED=1`. Each mandate has a lifetime ceiling of 25 additional scheduled Cala requests, separate from customer-requested passes. Scheduled work creates no model conversation, asks no new signal probes, and preserves the mandate's stage. Customer and scheduled passes acquire the same atomic claim before loading the current mandate. Reservations are conservative on errors. A pass with no requests closes further research. The owner can stop subsequent passes from the mandate page; an in-flight pass may finish.

A crashed process can leave `continuing_since` set. Check that no pass is active before manually clearing that claim; automatic lock expiry could allow concurrent spending. Deployment schedule registration and live Cala responses must be verified in the target environment. eve dev does not fire cron schedules.

## Count manifest — 2026-11-15

These figures were reported during the historical hackathon crawl; they have not been re-measured against production in this change. The original report is the source, not a current database query. Historical figures without preserved response evidence remain **unverified historical reports**.

| Reported count | Definition and evidence |
| --- | --- |
| 2,988 | Historical Slush attendee entities reported by the crawl. Not proof of physical attendance. |
| 612 | Historical non-attendee, non-person entities selected by investment adjacency. Not verified investors. |
| 4,212 | Historical entities reported crawled. |
| 4,218 | Stored entities reported in the council review. This differs from crawled entities; the cause is unknown. |
| 16,112 | Historically reported rounds/events total. Funding rounds and corporate events must be counted separately in the current store. |
| 81,010 | Historically reported relationship records, not independent sourced meeting paths. |
| 27,366 | Historically reported person ties. Path finding does not walk these ties. |
| 20 | Historically reported agreement ties. Ownership-plus-agreement paths may be sparse. |

Run the read-only `packages/ledger/scripts/counts.sql` with psql to produce current counts and their measurement time. Current queries cannot reconstruct a historical snapshot. Report current measurements separately from the historical table.

## Limits

Cala roster membership means “listed by Cala as an attendee”; it establishes neither presence nor availability. Founder targets can have unknown attendance. Lack of a stored investment tie does not establish that two people have never met. Supply known contacts as exclusions; incomplete exclusions cannot guarantee new contacts. Connections establish neither an introduction nor current investment appetite. No repository code establishes comparisons such as “nobody has listed this.”

Ownership paths preserve Cala's relationship direction and name the parties that actually signed each agreement. Public money attaches to its named recipient. Source links establish traceability, not independent verification of the source's claims.
