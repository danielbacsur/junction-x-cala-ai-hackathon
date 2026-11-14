# Fixtures

Saved Cala responses, committed so the ledger can be built, tested and shown without a live call.

## Where they came from

The three `evidence-round-*-fable` folders are file-for-file copies of `.handoff/debate/evidence-round-{2,4,6}-fable` in the main checkout, made on 2026-11-14. Each folder keeps its own `README.md`. Nothing was fetched for this package, and no key is in any file.

- **Round 4 and round 6** files wrap the body as `{_request, _fetched_at, _seconds, response}`. The importer maps `_request` to the `CalaRequest` the live client would build and stores the response under that request's ID, so the same request is later answered from the store.
- **Round 2** files were saved bare, without their request or fetch time. `manifest.json` says how each one is imported. Their fetch time is stored as 12:02 EET and marked approximate; round 2 made its requests between about 11:50 and 12:02.
- **The Slush roster** (`evidence-round-2-fable/slush-attendees.json`) is the merged list of 2,989 participants. The three page responses were not saved, so the importer cuts the list back into three pages and stores each under the request for that page. The provenance of those three rows says so.

## What is ours

- `manifest.json` records which files are request bodies, which are skipped and why, how the bare files are imported, and which entity each signal probe was asked about. A probe's question names an entity but carries no ID, so the subject has to be recorded beside it.
- `extractions/` holds hand-written readings of the three probe answers, in the shape the agreement extractor returns. They stand in for the model call when fixtures are imported and in tests. The ledger's deterministic checks still decide which readings become agreement edges; several of these are refused on purpose.

The public-funder registry is seeded from `evidence-round-4-fable/public-funder-registry.seed.json` by `sql/102_public_funder_seed.sql`.

## Loading them

```sh
npm run fixtures -w @fundraising/package-ledger
```

applies the migrations and imports everything into the database named by `DATABASE_URL`. It can be run again at any time.
