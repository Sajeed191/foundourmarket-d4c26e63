
REVOKE ALL ON FUNCTION public.reserve_order_stock(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_order_stock(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_order_stock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_order_stock(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_stock(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_order_stock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_orders() TO service_role;
