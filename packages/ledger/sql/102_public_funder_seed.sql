-- The public-funder registry, seeded from fixtures/evidence-round-4-fable/public-funder-registry.seed.json.
-- Where the seed left an ID open, it was resolved by name against the saved reads, and the basis
-- names the file. A seed body with two IDs is one display label over two separate entities.
-- "ours" is false only where the seed's basis quotes Cala's own description. Nothing else enters
-- this table without a person: new grantors and lenders wait in public_funder_review.

insert into public_funders (entity_id, label, country, fund_of_funds, basis, ours) values
  ('d5b41639-eb27-43df-a6ee-a4f03807fbca', 'Business Finland', 'FI', false, 'Cala description: Finnish government agency', false),
  ('3b0499bc-3c7e-4d50-aee5-42de34a5f8d0', 'Business Finland', 'FI', false, 'Cala description: Finnish government agency', false),
  ('41c754b1-029c-4087-b456-920d3c67ae0e', 'Business Finland Venture Capital', 'FI', true, 'Cala description: government agency''s venture capital arm investing in early-stage VC funds', false),
  ('df5be140-d50e-4e21-bb4f-d8f1e4ad3959', 'Tesi (Finnish Industry Investment)', 'FI', true, 'Cala description: Finnish public investment company', false),
  ('767464bf-a91c-49b8-817a-b9cfec86f5c4', 'Solidium Oy', 'FI', false, 'our classification: Finnish state holding company', true),
  ('01c894d5-9eee-4929-a536-c1626fcddb96', 'European Investment Bank', 'EU', false, 'Cala description: EU-owned multilateral development bank', false),
  ('4b4ee6ab-0588-4802-8e4b-428fad1c2ee9', 'European Investment Fund', 'EU', true, 'our classification: EIB Group fund of funds', true),
  ('cc0d7437-ffbd-4981-9711-4c26ba4cccdb', 'European Commission', 'EU', false, 'grantor in graph (Katana MRP, cordis.europa.eu)', true),
  ('1dc243c5-c12b-4639-b560-3d13988cf767', 'Scaleup Europe Fund', 'EU', false, 'our classification: EU-backed growth fund', true),
  ('02a2a281-4d2f-4647-9af3-cae7ac067489', 'EIC Fund', 'EU', false, 'our classification; appears in EIB''s portfolio list; ID resolved by name from eib-hub.json', true),
  ('077d67bb-1ec0-484e-892a-4140d31af6d1', 'Saminvest AB', 'SE', true, 'our classification: Swedish state-owned fund of funds (Cala''s description says only ''Swedish venture capital firm'')', true),
  ('63261106-7e97-4765-b212-96ee486a2e05', 'VINNOVA', 'SE', false, 'grantor in graph (Redpine, vinnova.se); ID resolved by name from round-grant-redpine.json', true),
  ('7684b497-6faa-4239-8344-597c42d95999', 'Stiftelsen Industrifonden', 'SE', false, 'our classification: state-founded evergreen fund; investor in Open Payments Europe; ID resolved by name from star-lum-openpayments.json', true),
  ('e8203bac-13d8-5d13-ab4d-996b6657363b', 'Innovation Norway', 'NO', false, 'grantor in graph (Photoncycle, stotte.brreg.no); ID resolved by name from round-grant-photoncycle-2025.json', true),
  ('76d8c340-04bf-474a-b8c6-00c4e8438b79', 'ENOVA SF', 'NO', false, 'grantor in graph (Photoncycle, stotte.brreg.no); ID resolved by name from round-grant-photoncycle-2025b.json', true),
  ('6258b41e-9e4a-4df3-927c-37cb96378959', 'Innovate UK', 'GB', false, 'grantor in graph (Waymap, gtr.ukri.org); ID resolved by name from round-grant-waymap.json', true),
  ('50732e32-f90a-40b1-8f28-2d3414b5fa53', 'NSSIF (National Security Strategic Investment Fund)', 'GB', false, 'our classification; investor in ICEYE; ID resolved by name from iceye-full-star.json', true),
  ('a2abbba3-d423-4c3b-abb4-e0e24c05e91d', 'High-Tech Gründerfonds', 'DE', false, 'our classification: public-private seed fund', true),
  ('43f1235b-4325-4e2f-8d90-bd0e4b2a99c1', 'IFB Innovationsstarter GmbH', 'DE', false, 'grantor in graph (TrustNXT); ID resolved by name from round-grant-trustnxt.json', true),
  ('903f54b0-1bb2-406c-8bcc-9b80df792a75', 'NASA', 'US', false, 'counterparty in a Cala knowledge claim (Kuva Space)', true),
  ('9bfb7eb4-0dab-415b-ac4c-861b03eb3aec', 'ESA', 'EU', false, 'counterparty in Cala knowledge claims (ICEYE, Kuva Space)', true)
on conflict (entity_id) do nothing;
