-- What the research engine keeps per mandate. Mandate rows themselves live in the private store,
-- so mandate_id is a plain value here and not a foreign key.

create table book_rows (
  id text primary key,
  mandate_id text not null,
  revision integer not null,
  rank integer not null,
  candidate_id text not null,
  subject_id text not null,
  -- lead, follow_up, non_dilutive or direct_fit.
  category text not null,
  -- What the candidate is to the customer, such as "investor in a company beside you".
  candidate_role text not null,
  reason text not null,
  fit jsonb not null default '[]',
  trail_ids jsonb not null default '[]',
  best_trail jsonb,
  direct_fit_only boolean not null default false,
  enrichment text not null,
  unknowns jsonb not null default '[]',
  has_brief boolean not null default false,
  -- The values the row was ordered by, kept so a ranking can be explained later.
  ranking jsonb not null default '{}',
  unique (mandate_id, revision, candidate_id)
);

create index book_rows_mandate on book_rows (mandate_id, revision, rank);

-- One row per ranked revision, with what the research could not establish.
create table book_runs (
  mandate_id text not null,
  revision integer not null,
  gaps jsonb not null default '[]',
  candidates_considered integer not null default 0,
  ranked_at timestamptz not null default now(),
  primary key (mandate_id, revision)
);

-- What Cabala made of a trail. Always Inferred, and private to the mandate.
create table conclusions (
  mandate_id text not null,
  trail_id text not null,
  reading text not null,
  because text not null,
  does_not_prove text not null,
  ask text not null,
  saved_at timestamptz not null default now(),
  primary key (mandate_id, trail_id)
);

-- Signal probes asked for a mandate, to hold it to its probe budget.
create table mandate_probes (
  mandate_id text not null,
  entity_id text not null,
  response_id text,
  from_store boolean not null,
  asked_at timestamptz not null default now(),
  primary key (mandate_id, entity_id)
);

-- Gaps a research pass ran into, kept until the next pass replaces them.
create table mandate_gaps (
  mandate_id text primary key,
  gaps jsonb not null default '[]',
  partial boolean not null default false,
  noted_at timestamptz not null default now()
);
