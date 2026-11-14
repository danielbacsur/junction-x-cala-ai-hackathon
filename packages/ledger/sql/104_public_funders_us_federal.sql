-- United States federal departments that appear as grantors in the cohort. They have fewer than
-- three grants in the store, so the first review did not reach them; both are plainly public
-- bodies, and the classification is ours.

insert into public_funders (entity_id, label, country, fund_of_funds, basis, ours) values
  ('fecb083a-031f-41ba-b2d1-f4a39df8fa36', 'U.S. Department of Defense', 'US', false, 'our classification: United States federal department', true),
  ('c58f6760-55ca-472a-acad-d60daf76746d', 'U.S. Department of Energy', 'US', false, 'our classification: United States federal department', true),
  ('8a11b44d-8f65-4c5d-967a-682e7a6e60a7', 'U.S. Department of Energy', 'US', false, 'our classification: United States federal department', true)
on conflict (entity_id) do nothing;

-- Signals are derived from the registry, so the next reader rebuilds them.
update store_meta set value = to_jsonb('stale'::text) where key = 'derived_seq';
