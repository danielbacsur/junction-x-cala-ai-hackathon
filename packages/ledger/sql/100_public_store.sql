-- The public evidence store: what Cala said and when, and the graph normalized from it.
-- Nothing in these tables belongs to a customer, so every mandate reuses them.

-- Raw responses are kept as they came. A fresh read of the same request adds a row; it never
-- replaces one.
create table raw_responses (
  id text not null,
  fetched_at timestamptz not null,
  request jsonb not null,
  kind text not null,
  entity_id text,
  status integer not null,
  seconds double precision not null,
  body jsonb,
  -- Where a fixture came from. Null for a response the live client stored.
  provenance jsonb,
  -- The version of the normalizer that last read this row into the tables below.
  ingest_version integer,
  stored_at timestamptz not null default now(),
  primary key (id, fetched_at)
);

create index raw_responses_entity on raw_responses (entity_id);

-- One row per reserved request start. The Cala client paces every key against this table.
create table quota_ledger (
  id bigserial primary key,
  key_index integer not null,
  start_at timestamptz not null,
  reserved_at timestamptz not null default clock_timestamp()
);

create index quota_ledger_key_start on quota_ledger (key_index, start_at desc);
create index quota_ledger_start on quota_ledger (start_at);

-- The outage latch. One row, shared by every process.
create table cala_latch (
  only_row boolean primary key default true check (only_row),
  latched boolean not null default false,
  since timestamptz,
  reason text,
  checked_at timestamptz
);

insert into cala_latch default values;

create table entities (
  id text primary key,
  name text not null,
  entity_type text not null,
  description text,
  -- Properties with their sources, from the entity's own read.
  properties jsonb,
  -- Lowercase name without punctuation or legal form. Used for search and identity proposals.
  name_key text not null,
  -- star, person, round, roster or partial. Null when the entity was only seen in a list.
  read_kind text,
  read_response_id text,
  read_at timestamptz,
  first_seen_in text not null,
  first_seen_at timestamptz not null
);

create index entities_name_key on entities (name_key);
create index entities_read_kind on entities (read_kind);

-- Relationships as Cala states them: source_id RELATIONSHIP target_id. Each row also records
-- whose read showed it and in which of that read's lists.
create table edges (
  id text primary key,
  cala_edge_id text,
  source_id text not null,
  target_id text not null,
  relationship text not null,
  -- investment, ownership, person, agreement, membership or context (see research/relations.ts).
  family text not null,
  observed_on text not null,
  observed_direction text not null,
  role text,
  valid_since text,
  valid_until text,
  properties jsonb not null default '{}',
  -- native edges come from entity reads; derived ones from a Cala knowledge claim.
  origin text not null default 'native',
  claim text,
  claim_id text,
  sources jsonb not null default '[]',
  response_id text not null,
  fetched_at timestamptz not null
);

create index edges_source on edges (source_id, family);
create index edges_target on edges (target_id, family);
create index edges_observed on edges (observed_on, relationship, observed_direction);
create index edges_relationship on edges (relationship);

-- Funding rounds and corporate events. The dated fields are filled by a read of the round itself.
create table rounds (
  id text primary key,
  entity_type text not null,
  name text,
  round_label text,
  round_type text,
  event_type text,
  instrument text,
  transaction_value double precision,
  transaction_value_units text,
  announcement_date text,
  close_date text,
  event_date text,
  aliases jsonb,
  annotations jsonb,
  sources jsonb not null default '[]',
  read_response_id text,
  read_at timestamptz
);

-- Who took part in a round or event, in which role, and whose read said so.
create table participations (
  round_id text not null,
  entity_id text not null,
  role text not null default '',
  observed_on text not null,
  is_lead boolean,
  event_date text,
  cala_edge_id text,
  sources jsonb not null default '[]',
  response_id text not null,
  fetched_at timestamptz not null,
  primary key (round_id, entity_id, role, observed_on)
);

create index participations_entity on participations (entity_id, role);

-- Event participants, such as the Slush 2026 roster.
create table roster (
  event_id text not null,
  entity_id text not null,
  role text not null,
  sources jsonb not null default '[]',
  response_id text not null,
  fetched_at timestamptz not null,
  primary key (event_id, entity_id)
);

create index roster_entity on roster (entity_id);

-- What each read asked for and how much came back. A list that returned exactly its limit is
-- truncated until it is paged.
create table coverage (
  entity_id text not null,
  relationship text not null,
  direction text not null,
  requested_offset integer not null default 0,
  requested_limit integer,
  returned integer not null,
  truncated boolean not null,
  response_id text not null,
  fetched_at timestamptz not null,
  primary key (entity_id, relationship, direction, requested_offset)
);

-- Entities that may be the same. A proposal is never a join: trails do not cross IDs.
create table identity_groups (
  id text primary key,
  basis text not null,
  key text not null,
  status text not null default 'proposed',
  reviewer text,
  decision_basis text,
  decided_at timestamptz
);

create table identity_members (
  group_id text not null references identity_groups (id) on delete cascade,
  entity_id text not null,
  primary key (group_id, entity_id)
);

create index identity_members_entity on identity_members (entity_id);

-- Bodies we treat as public funders. Classification attaches to one legal entity; two IDs may
-- share a display label without being joined.
create table public_funders (
  entity_id text primary key,
  label text not null,
  country text,
  fund_of_funds boolean not null default false,
  basis text not null,
  -- True when the classification is ours and not stated in Cala's description.
  ours boolean not null,
  added_at timestamptz not null default now()
);

-- Grantors and lenders seen in the graph that are not in the registry. They wait here for a
-- person; nothing enters the registry by itself.
create table public_funder_review (
  entity_id text primary key,
  name text not null,
  roles jsonb not null default '[]',
  first_seen_in text not null,
  status text not null default 'pending',
  noted_at timestamptz not null default now()
);

-- One row per signal probe answer.
create table probes (
  response_id text primary key,
  subject_id text,
  question text not null,
  asked_at timestamptz not null,
  entities jsonb not null default '[]',
  claim_count integer not null,
  -- Null until the claims were read for agreements; then how many agreements they held.
  agreements_found integer,
  extracted_at timestamptz
);

create index probes_subject on probes (subject_id);

-- Claims are stored as Cala reported them, with the passages they cite.
create table probe_claims (
  id text primary key,
  response_id text not null,
  subject_id text,
  claim_index integer not null,
  text text not null,
  passages jsonb not null default '[]',
  -- The agreement fields read out of this claim, kept with the claim they came from.
  extraction jsonb,
  -- reported, edge or unresolved.
  status text not null default 'reported',
  reason text
);

create index probe_claims_subject on probe_claims (subject_id);

-- The traversable relation, computed from edges and participations. Each pair is stored in both
-- orientations, so trail patterns are plain joins on from_id.
create table ties (
  from_id text not null,
  to_id text not null,
  family text not null,
  relationship text not null,
  -- from_funds_to, to_funds_from, undirected or not_applicable.
  direction text not null,
  -- The rounds whose roles settle the direction.
  direction_basis jsonb not null default '[]',
  -- What Cala's own INVESTED_IN edges state: from_to, to_from, both or none. It filters
  -- candidates and never words a hop.
  stated text not null default 'none',
  role text,
  origin text not null,
  -- One key per underlying relationship, the same in both orientations.
  key text not null,
  edge_ids jsonb not null default '[]',
  primary key (from_id, to_id, family, relationship)
);

create index ties_to on ties (to_id, family);
create index ties_key on ties (key);

create table signals (
  id text primary key,
  type text not null,
  entity_id text not null,
  label text not null,
  date text,
  date_kind text,
  value double precision,
  units text,
  value_is_programme_ceiling boolean not null default false,
  instrument text,
  parties jsonb not null default '[]',
  origin text not null,
  claim text,
  public_basis jsonb,
  flag text,
  sources jsonb not null default '[]',
  -- The round, edge or claim the signal was derived from.
  basis_id text
);

create index signals_entity on signals (entity_id, type);

create table trails (
  id text primary key,
  subject_id text not null,
  -- founder or investor: the two walk different patterns from the same subject.
  mode text not null,
  end_id text not null,
  pattern text not null,
  hops jsonb not null,
  hop_count integer not null,
  signal_id text,
  signal jsonb,
  signal_date text,
  weakest_source_rank text,
  independent_trails integer not null default 1,
  read_in_full jsonb not null default '[]',
  seen_in_list_only jsonb not null default '[]',
  -- The underlying relationships of the path, for counting independent trails.
  path_key text not null,
  -- Product of 1/ln(2 + portfolio size) over the investors the path passes through.
  weight double precision not null default 1,
  computed_at timestamptz not null default now()
);

create index trails_subject on trails (subject_id, mode, end_id);

create table store_meta (
  key text primary key,
  value jsonb not null
);
