
REVOKE EXECUTE ON FUNCTION public.measurements_compute_leaf() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.measurements_cascade_after() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_parent_measurement(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cascade_recompute_ancestors(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
