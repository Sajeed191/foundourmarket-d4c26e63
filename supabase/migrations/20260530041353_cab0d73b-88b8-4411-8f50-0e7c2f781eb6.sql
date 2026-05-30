CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = off) AS
SELECT id, full_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;