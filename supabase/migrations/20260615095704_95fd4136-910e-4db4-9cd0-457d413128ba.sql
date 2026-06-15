CREATE TABLE public.support_agent_presence (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  last_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_agent_presence TO authenticated;
GRANT ALL ON public.support_agent_presence TO service_role;

ALTER TABLE public.support_agent_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view all presence" ON public.support_agent_presence
FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insert own presence" ON public.support_agent_presence
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_staff(auth.uid()));

CREATE POLICY "Staff update own presence" ON public.support_agent_presence
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND public.is_staff(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_support_agent_presence_updated_at
BEFORE UPDATE ON public.support_agent_presence
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Aggregate, name-free availability for customer-facing display.
CREATE OR REPLACE FUNCTION public.support_availability()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'online_count', COUNT(*) FILTER (WHERE last_active_at >= now() - interval '5 minutes'),
    'away_count',   COUNT(*) FILTER (WHERE last_active_at >= now() - interval '30 minutes'
                                        AND last_active_at <  now() - interval '5 minutes'),
    'last_active_at', MAX(last_active_at)
  )
  FROM public.support_agent_presence;
$$;

REVOKE EXECUTE ON FUNCTION public.support_availability() FROM public;
GRANT EXECUTE ON FUNCTION public.support_availability() TO authenticated, anon;

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_agent_presence;