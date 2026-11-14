-- The private store: who owns what, and the work done for them. Nothing in these tables is shared
-- between customers, and the public evidence store never refers to them.

create table guests (
  id text primary key,
  created_at timestamptz not null default now()
);

create table mandates (
  id text primary key,
  owner_id text not null references guests (id),
  role text not null check (role in ('founder', 'investor')),
  subject jsonb not null,
  constraints jsonb not null,
  revision integer not null default 1,
  stage text not null default 'brief_received'
    check (stage in ('brief_received', 'researching', 'challenging', 'ready', 'delivered')),
  session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mandates_owner on mandates (owner_id, created_at desc);

-- One eve session carries one mandate, so a session ID can never be attached to a second one.
create unique index mandates_session on mandates (session_id) where session_id is not null;

-- One row per version. The trails and the evidence are frozen with the version they were saved on.
create table packets (
  id text primary key,
  mandate_id text not null references mandates (id) on delete cascade,
  version integer not null,
  candidate jsonb not null,
  based_on_revision integer not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  sections jsonb not null,
  trails jsonb not null,
  withheld jsonb not null,
  evidence jsonb not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (mandate_id, version)
);

-- Approval belongs to exactly one version of a mandate's packet.
create unique index packets_approved on packets (mandate_id) where status = 'approved';

create table work_events (
  id bigint generated always as identity primary key,
  mandate_id text not null references mandates (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null
    check (kind in ('stage', 'read', 'probe', 'trail', 'book', 'withheld', 'queued', 'outage', 'gap', 'note')),
  message text not null,
  seconds double precision,
  entity jsonb,
  from_store boolean not null default false,
  -- Names the step that wrote the line, so a retried step does not write it twice.
  key text,
  -- Set on the lines the store writes while saving a packet version; the statement of work counts
  -- those claims from the packet, not from the line.
  packet_version integer
);

create index work_events_mandate on work_events (mandate_id, id);
create unique index work_events_key on work_events (mandate_id, key) where key is not null;
