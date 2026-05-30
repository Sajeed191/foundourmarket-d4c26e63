-- =====================================================================
-- P1-8 Security Hardening: lock down privileged operational RPCs.
-- Strategy:
--   1. Create service_role-only SECURITY DEFINER wrappers (svc_*) that
--      re-verify the actor's staff role and impersonate the actor (so the
--      inner functions' auth.uid()-based checks and audit logging keep
--      working) before delegating to the existing engine functions.
--   2. Revoke EXECUTE on the underlying privileged RPCs from PUBLIC, anon
--      and authenticated. Only service_role (and the postgres cron owner)
--      may execute them directly.
-- =====================================================================

-- Append-only authorization audit log (actor, role, action, IP, outcome).
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid,
  actor_role   text,
  action       text NOT NULL,
  target       text,
  source_ip    text,
  success      boolean NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Staff can read the security audit log; nobody can mutate it via the API
-- (only service_role / SECURITY DEFINER code writes to it).
DROP POLICY IF EXISTS "staff read security audit" ON public.security_audit_log;
CREATE POLICY "staff read security audit"
ON public.security_audit_log FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(),
  ARRAY['admin','super_admin','manager']::app_role[]));

-- ---------------------------------------------------------------------
-- Marketing automation wrappers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_run_marketing_automations(
  _actor uuid,
  p_force boolean DEFAULT true,
  p_triggered_by text DEFAULT 'manual',
  p_only_automation uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(_actor, ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]) THEN
    RAISE EXCEPTION 'Not authorised to run automations';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _actor)::text, true);
  RETURN public.run_marketing_automations(p_force, p_triggered_by, p_only_automation);
END; $$;

CREATE OR REPLACE FUNCTION public.svc_retry_failed_execution(
  _actor uuid, p_execution_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(_actor, ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]) THEN
    RAISE EXCEPTION 'Not authorised to retry automations';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _actor)::text, true);
  RETURN public.retry_failed_execution(p_execution_id);
END; $$;

CREATE OR REPLACE FUNCTION public.svc_retry_all_failed_executions(
  _actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(_actor, ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]) THEN
    RAISE EXCEPTION 'Not authorised to retry automations';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _actor)::text, true);
  RETURN public.retry_all_failed_executions();
END; $$;

CREATE OR REPLACE FUNCTION public.svc_set_automation_settings(
  _actor uuid, p_emergency boolean, p_global boolean, p_maintenance boolean
) RETURNS public.automation_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.automation_settings;
BEGIN
  IF NOT has_any_role(_actor, ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role]) THEN
    RAISE EXCEPTION 'Not authorised to change automation controls';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _actor)::text, true);
  SELECT * INTO v_row FROM public.set_automation_settings(p_emergency, p_global, p_maintenance);
  RETURN v_row;
END; $$;

-- ---------------------------------------------------------------------
-- Order operations & staff/user directory wrappers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_admin_order_operations(
  _actor uuid, _limit integer DEFAULT 400
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(_actor, ARRAY['admin','super_admin','manager','support','fulfillment','warehouse_staff']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _actor)::text, true);
  RETURN public.admin_order_operations(_limit);
END; $$;

CREATE OR REPLACE FUNCTION public.svc_admin_staff_performance(
  _actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(_actor, ARRAY['admin','super_admin','manager','support','fulfillment','warehouse_staff']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _actor)::text, true);
  RETURN public.admin_staff_performance();
END; $$;

CREATE OR REPLACE FUNCTION public.svc_admin_user_directory(
  _actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(_actor, ARRAY['admin','super_admin','manager','support','editor']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _actor)::text, true);
  RETURN public.admin_user_directory();
END; $$;

-- ---------------------------------------------------------------------
-- Revoke direct client access to the underlying privileged RPCs.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.run_marketing_automations(boolean, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retry_failed_execution(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retry_all_failed_executions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_automation_settings(boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_order_operations(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_staff_performance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_user_directory() FROM PUBLIC, anon, authenticated;

-- Keep service_role able to execute the underlying engines.
GRANT EXECUTE ON FUNCTION public.run_marketing_automations(boolean, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_failed_execution(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_all_failed_executions() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_automation_settings(boolean, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_order_operations(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_staff_performance() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_directory() TO service_role;

-- The secure wrappers are callable ONLY by service_role (trusted server fns).
REVOKE EXECUTE ON FUNCTION public.svc_run_marketing_automations(uuid, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.svc_retry_failed_execution(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.svc_retry_all_failed_executions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.svc_set_automation_settings(uuid, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.svc_admin_order_operations(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.svc_admin_staff_performance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.svc_admin_user_directory(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.svc_run_marketing_automations(uuid, boolean, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_retry_failed_execution(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_retry_all_failed_executions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_set_automation_settings(uuid, boolean, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_admin_order_operations(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_admin_staff_performance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_admin_user_directory(uuid) TO service_role;