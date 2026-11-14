# Evidence, round 4 (Fable)

46 successful live Cala requests on Saturday 2026-11-14, machine clock 12:19 to 12:30 EET, at least 6.6 s between starts, no 429. Every response file wraps the body as `{_request, _fetched_at, _seconds, response}`.

## Request templates (reusable by the builders)

| File | Use |
|---|---|
| `star-body.json` | Superset star read for a company, investor or organisation. Unknown or absent relationship names come back empty, so no introspection call is needed. |
| `person-body.json` | Star read for a person (outgoing people edges). |
| `round-body.json` | Funding round or corporate event with participants and roles. |
| `public-funder-registry.seed.json` | Seed of the public-funder registry with the entity IDs resolved today. |
| `probe.py`, `probe_par.py` | The paced scripts used here. The key is read from the repo's `.env` and never printed. |

## Responses

| Files | What they show |
|---|---|
| `iceye-bogus-rels.json` | Eight invented relationship names return 200 with empty relationships. |
| `iceye-full-star.json` | ICEYE: 17 investors including state-linked bodies; all 16 corporate events are financings; one founder. |
| `eib-hub.json`, `hub-business-finland-org.json`, `hub-business-finland-oy.json` | Public funders as hubs: portfolio, round roles (`GRANTOR`, `LENDER`, `INVESTOR`), financing events. Business Finland exists as two entities; 19 of their 52 investees are Slush attendees. |
| `hub-kfund.json`, `hub-kibo.json`, `hub-masia.json`, `hub-htgf.json`, `hub-luminar.json`, `hub-saminvest.json` | Investor hubs. Slush overlap 4, 2, 3, 8, 6. Incoming `INVESTED_IN` on Kfund, Kibo and Masia lists their own portfolio companies (direction unreliable). Luminar's incoming list holds Saminvest and the European Investment Fund. |
| `hub-palantir.json`, `lookup-palantir-cik.json`, `search-palantir.json` | SEC filer: event types beyond financing (`MATERIAL_AGREEMENT_ANNOUNCED`, `MANAGEMENT_OR_BOARD_CHANGE`, `SHAREHOLDER_VOTE`, `LISTING_STATUS_CHANGE`), 40 subsidiaries; 1,000 beneficial owners made the read take 24.7 s and 709 KB; several duplicate Palantir entities. |
| `star-cala-ai.json`, `star-kosmovera.json` | Cala AI: four investors, two founders, and KOSMOVERA, S.L. as a subsidiary edge sourced to the Spanish company gazette. |
| `star-redpine.json`, `star-rnd-*.json` | Ten Slush attendee stars (two chosen, eight random with seed 20261114). |
| `star-lum-*.json` | The five other Slush attendees in Luminar's portfolio. |
| `round-grant-*.json` | Grant rounds: `instrument: GRANT`, amount, dates and a `GRANTOR` participant (VINNOVA, Innovate UK, IFB Innovationsstarter, European Commission, ENOVA SF, Innovation Norway), sourced to the grantor's own register. |
| `person-peter-sarlin.json` | A person entity that is a stub with one edge; 7.9 s. |
| `ksearch-iceye-gov.json` | `knowledge/search`: 14 government and partner agreements for ICEYE as 11 atomic claims with references, 21 source passages, 15 resolved entities; 60 s. |
| `ksearch-signal-kuva-space.json`, `ksearch-signal-redpine.json`, `kquery-signal-distance.json` | Three overlapped probes started 7 s apart, all done in 60 s wall-clock. Kuva Space: NASA award, Syke pilot, IHI MoU. Redpine: none found (the graph holds its Vinnova grant). Distance Technologies through `knowledge/query`: 8 typed rows, 6 entities, no sources. |
| `search-*.json`, `iphone-supply-chain-members.json` | Entity search results; the "iPhone supply chain" organisation has one member, so `IS_MEMBER_OF` is not a supplier graph. |

## Two trails verified end to end

1. Redpine Technology AB ← NordicNinja VC and Luminar Ventures → Photoncycle → Grant rounds from ENOVA SF (NOK 14,376,817, event date 2025-03-13) and Innovation Norway (NOK 5,300,000), sourced to Norway's state-aid register `stotte.brreg.no`. Redpine and Photoncycle are both Slush attendees. Nine reads.
2. ICEYE — IHI Corporation — Kuva Space. IHI has the same entity ID (`6d909137-a0a9-414c-bc93-40cbf5f6acd8`) in the ICEYE and Kuva Space probe answers. Two probes.

## The refusal at 12:41

After the 46 successful requests and an eleven-minute pause, every request from this machine returned an HTML `403 Forbidden` from `awselb/2.0`: the Cala AI star read that had worked at 12:23 (`star-cala-ai-recheck-original-body.error.json`), the same read with candidate relationship names and wider limits (`star-cala-ai-template-v2.error.json`), a keyed entity search under another user agent, and a keyless GET of `/openapi.json`. A keyless request at 12:43 was still refused. No further requests were made. The cause is not established. Because of it, `star-body.json` is the body that ran (limit 200, no candidate names); the wider limits and the candidate names were verified in other requests, not in one combined request.
