GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_user_role(uuid, public.app_role, boolean, text) TO authenticated, service_role;