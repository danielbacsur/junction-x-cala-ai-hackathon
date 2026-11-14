-- Public funders added after reviewing the grantors of the Slush cohort's funding rounds on
-- 2026-11-14. The review covered every unclassified grantor with three or more grants in the
-- store. Only bodies that are plainly part of a state, a region, a city or the European Union
-- were added, and "ours" says the classification is ours unless Cala's own description states
-- it. Private foundations, accelerators, universities and EU-co-funded partnerships with their
-- own legal form stay in the review queue, so their grants show as grants without being called
-- public money. A body listed under two entity IDs is one label over two separate entities.

insert into public_funders (entity_id, label, country, fund_of_funds, basis, ours) values
  ('b7143bb3-c9a2-421e-ae61-d2c33088f953', 'European Innovation Council', 'EU', false, 'Cala description: a European Union organization', false),
  ('346e2da2-b549-4992-9e10-420e4ecfe4eb', 'European Commission', 'EU', false, 'our classification: executive body of the European Union', true),
  ('513579d0-766d-5de6-a5d0-5e619d9edf9b', 'Bundesministerium für Bildung und Forschung', 'DE', false, 'our classification: German federal ministry', true),
  ('c11c80dd-f29e-5f65-bc84-06871200dcef', 'European Commission', 'EU', false, 'our classification: executive body of the European Union', true),
  ('8d0da3c0-2230-498e-9a25-3a2932c182ce', 'Innovate UK', 'GB', false, 'our classification: United Kingdom government innovation agency', true),
  ('ce876685-96f1-4a29-85e1-37e674418f31', 'Bundesministerium für Wirtschaft und Technologie', 'DE', false, 'our classification: German federal ministry', true),
  ('2da620a1-768c-44de-bdfe-89910e347c88', 'European Commission', 'EU', false, 'our classification: executive body of the European Union', true),
  ('bc0fea32-76f7-46fa-84aa-1535712e528f', 'Innovate UK', 'GB', false, 'our classification: United Kingdom government innovation agency', true),
  ('340af901-9ea9-424b-b09d-ec471bbe4f63', 'Bpifrance', 'FR', false, 'Cala description: a French public investment bank', false),
  ('bc852a64-d8c7-45b2-8be9-1139f247a8a2', 'Red.es', 'ES', false, 'our classification: Spanish public business entity', true),
  ('d4f3253b-4daa-458a-89a4-e9cd8f6eed13', 'Innosuisse', 'CH', false, 'our classification: Swiss federal innovation agency', true),
  ('0cb6f26f-170f-442b-895d-ac8b5b6fe58b', 'Austria Wirtschaftsservice', 'AT', false, 'our classification: Austrian federal promotional bank', true),
  ('1be98f01-35c8-42b9-abbe-3cec109716b4', 'European Regional Development Fund', 'EU', false, 'our classification: structural fund of the European Union', true),
  ('affba86e-bb50-422d-a549-c6a3ed8e2770', 'Innovation Fund Denmark', 'DK', false, 'our classification: Danish state innovation fund', true),
  ('314bfb4e-bf86-564e-af75-0633cda50429', 'Inovacijų agentūra', 'LT', false, 'our classification: Lithuanian state innovation agency', true),
  ('0bffa77f-7c8f-5b07-8288-b0d9ae5eec11', 'Recuperar Portugal', 'PT', false, 'our classification: Portuguese state body for the recovery plan', true),
  ('d798f2a9-9d41-5f5d-95b6-7c2c1e501347', 'European Union (Interreg)', 'EU', false, 'our classification: territorial cooperation programme of the European Union', true),
  ('45f9f633-3794-5fb4-b1f5-6fc7a7ead3b0', 'FFG', 'AT', false, 'our classification: Austrian federal research promotion agency', true),
  ('7f8c9224-0bf0-53e7-add6-249c052384da', 'Fundación EOI', 'ES', false, 'our classification: public foundation of Spain''s industry ministry', true),
  ('366f0a6e-a52b-480f-9d24-26fdf9086249', 'Investitionsbank Berlin', 'DE', false, 'our classification: development bank of the state of Berlin', true),
  ('e6cf0493-e895-447a-ae7b-24b90ee62564', 'Ministry of SMEs and Startups', 'KR', false, 'our classification: South Korean ministry', true),
  ('53499fac-37b6-4e04-9bf9-c26cefb361ad', 'Bundesministerium für Wirtschaft und Klimaschutz', 'DE', false, 'our classification: German federal ministry', true),
  ('0aa4fd3d-2fa6-5845-9efe-8eafb07bb51c', 'Estonian Business and Innovation Agency', 'EE', false, 'our classification: Estonian state foundation', true),
  ('6a18b402-c006-4604-a0fe-cc8e228cf5c6', 'European Space Agency', 'EU', false, 'our classification: intergovernmental space agency', true),
  ('f164839a-40e5-54f3-bbed-29b5340022a1', 'Research Council of Norway', 'NO', false, 'our classification: Norwegian state research council', true),
  ('7791fcac-b9b8-5dcb-8402-c7432af15e1a', 'Swedish Energy Agency', 'SE', false, 'our classification: Swedish state agency', true),
  ('e4266d96-64d9-42be-93ef-7f7b4c20ee2a', 'Agencia Estatal de Investigación', 'ES', false, 'our classification: Spanish state research agency', true),
  ('28bb7ff9-011a-47b3-b68b-4cb6277ce5cd', 'EUREKA Eurostars', 'EU', false, 'our classification: intergovernmental programme co-funded by the European Union', true),
  ('50ccaf50-bdf1-41be-a33a-a989c38e9d87', 'Enterprise Estonia', 'EE', false, 'our classification: Estonian state foundation', true),
  ('6a82e418-2d16-50c8-a54e-83e62404636d', 'European Space Agency', 'EU', false, 'our classification: intergovernmental space agency', true),
  ('47b92339-957d-4db3-b91b-39c018140cc9', 'SPRIND', 'DE', false, 'our classification: German federal agency', true),
  ('4c5b263f-0e43-5852-a69d-30aa096bf603', 'Investment and Development Agency of Latvia', 'LV', false, 'our classification: Latvian state agency', true),
  ('a26a2a43-b5e3-4694-aa0d-240d309fef61', 'ACCIÓ', 'ES', false, 'our classification: agency of the government of Catalonia', true),
  ('68225b45-3b44-5a48-b1e0-f8020e30e15b', 'Sekuens', 'ES', false, 'our classification: agency of the government of Asturias', true),
  ('bb911b6c-571a-4127-a87a-87e86709de6f', 'Circular Bio-based Europe Joint Undertaking', 'EU', false, 'our classification: joint undertaking of the European Union', true),
  ('6a9ce061-8da0-54a2-af22-7326e3459d9b', 'Ekonomikos ir inovacijų ministerija', 'LT', false, 'our classification: Lithuanian ministry', true),
  ('967d701c-7a1a-4b28-835d-70e654d02d51', 'VLAIO', 'BE', false, 'our classification: agency of the government of Flanders', true),
  ('051647b0-1814-5a79-8e62-9550eec12864', 'ADEME', 'FR', false, 'our classification: French state agency', true),
  ('ac793307-1730-4766-8c26-3bc508606821', 'CDTI', 'ES', false, 'our classification: Spanish public business entity', true),
  ('2616899a-e6d9-5e09-9191-14332eae9ddb', 'Comunidad de Madrid', 'ES', false, 'our classification: Spanish regional government', true),
  ('2b6b47d4-66fd-47c8-8e93-a396443548f0', 'CzechInvest', 'CZ', false, 'our classification: Czech state agency', true),
  ('f6b07dd7-a20c-5b3d-b6f1-8c5d61f246c9', 'ELY-keskus', 'FI', false, 'our classification: Finnish state regional authority', true),
  ('949561d6-494a-5264-952a-f6df55524cd7', 'PARP', 'PL', false, 'our classification: Polish state agency', true),
  ('2e88936f-3148-52b7-bd3d-00cf20ce48e5', 'Swiss National Science Foundation', 'CH', false, 'our classification: research funder mandated by the Swiss Confederation', true),
  ('3fed9f5b-1409-5e09-9546-d1912c210f82', 'Technology Development Fund', 'IS', false, 'our classification: Icelandic state fund', true),
  ('544cd8c9-0636-41d0-8ead-2948e24a43e9', 'UK Research and Innovation', 'GB', false, 'our classification: United Kingdom public research funder', true),
  ('057e9c33-7f38-526b-bff2-30698758a83c', 'Federal Ministry for Economic Affairs and Energy', 'DE', false, 'our classification: German federal ministry', true),
  ('c2476149-deb0-4457-bb40-b99cadd334ab', 'ICEX España Exportación e Inversiones', 'ES', false, 'our classification: Spanish public business entity', true),
  ('4f4b9f3f-3a38-5d01-b587-28c2a3b4f6d4', 'Instituto de Fomento de la Región de Murcia', 'ES', false, 'our classification: development agency of the region of Murcia', true),
  ('4e792291-2f06-49c2-846d-c66bdbd85bb4', 'Israel Innovation Authority', 'IL', false, 'our classification: Israeli state authority', true),
  ('0265fee6-1c79-5422-a0f9-16fc2c52e537', 'Korea Institute of Startup and Entrepreneurship Development', 'KR', false, 'our classification: South Korean government agency', true),
  ('88b486fc-55c3-5a95-b61a-41e8532ee06c', 'Land Nordrhein-Westfalen', 'DE', false, 'our classification: German federal state', true),
  ('6cdfa71a-709a-5714-8da1-b699f847d7d3', 'Ministry of the Economy and Innovation of Lithuania', 'LT', false, 'our classification: Lithuanian ministry', true),
  ('0b550aaa-9ee6-4b97-a309-ba814105e0b7', 'Sächsische Aufbaubank', 'DE', false, 'our classification: development bank of the state of Saxony', true),
  ('d2011fdd-2752-45b8-8ac2-1999f2014df6', 'Research Council of Norway', 'NO', false, 'our classification: Norwegian state research council', true),
  ('e0c60583-e010-49fd-931d-9b6c218aaf7a', 'Wirtschaftsagentur Wien', 'AT', false, 'our classification: fund of the City of Vienna', true),
  ('dac3f630-05c1-4885-8fc5-ae7ebdf9390d', 'FFG', 'AT', false, 'our classification: Austrian federal research promotion agency', true)
on conflict (entity_id) do nothing;

-- Signals are derived from the registry, so the next reader rebuilds them.
update store_meta set value = to_jsonb('stale'::text) where key = 'derived_seq';
