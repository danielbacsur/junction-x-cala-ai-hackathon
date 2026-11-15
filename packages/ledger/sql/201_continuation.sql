-- A failed process leaves a claim in place: fail closed rather than risk concurrent spending.
alter table mandates add column open boolean not null default true;
alter table mandates add column requests_spent integer not null default 0 check (requests_spent >= 0);
alter table mandates add column continuing_since timestamptz;
create index mandates_continuation on mandates (created_at) where open and continuing_since is null;
