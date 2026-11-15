-- Current measurements only; cannot reconstruct past crawl totals.
begin read only;
select clock_timestamp() as measured_at;
select count(*) as stored_entities,
       count(*) filter (where read_kind in ('star', 'person')) as read_in_full
from entities;
select entity_type, count(*) as records from rounds group by entity_type order by entity_type;
select relationship, count(*) as stored_edges from edges group by relationship order by relationship;
-- ties are oriented traversal records, not necessarily unique source relationships.
select family, count(*) as oriented_ties from ties group by family order by family;
select event_id, role, count(distinct entity_id) as roster_entities from roster group by event_id, role;
select count(*) as stored_trails from trails;
commit;
