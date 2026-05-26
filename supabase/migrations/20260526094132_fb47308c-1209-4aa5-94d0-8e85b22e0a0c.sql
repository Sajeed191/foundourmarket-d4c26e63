
-- 1. Bootstrap allow-list (server-side only; protected by RLS)
CREATE TABLE IF NOT EXISTS public.super_admin_bootstrap (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admin_bootstrap ENABLE ROW LEVEL SECURITY;

-- Only existing super_admins may read; nobody can write via API
DROP POLICY IF EXISTS "super admins read bootstrap" ON public.super_admin_bootstrap;
CREATE POLICY "super admins read bootstrap" ON public.super_admin_bootstrap
  FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.super_admin_bootstrap(email) VALUES
  ('foundourmarket@gmail.com'),
  ('sajeed50001mohammed@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- 2. Helper: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::app_role
  );
$$;

-- 3. Role-change audit log
CREATE TABLE IF NOT EXISTS public.role_change_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  target_user_id uuid NOT NULL,
  role app_role NOT NULL,
  action text NOT NULL, -- 'granted' | 'revoked' | 'bootstrap'
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.role_change_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super admins read role logs" ON public.role_change_logs;
CREATE POLICY "super admins read role logs" ON public.role_change_logs
  FOR SELECT USING (public.is_super_admin(auth.uid()));

-- 4. Prevent removal of the last super_admin
CREATE OR REPLACE FUNCTION public.prevent_last_super_admin_removal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining int;
BEGIN
  IF OLD.role = 'super_admin'::app_role THEN
    SELECT COUNT(*) INTO remaining FROM public.user_roles
      WHERE role = 'super_admin'::app_role AND user_id <> OLD.user_id;
    IF remaining = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last super_admin';
    END IF;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_last_super_admin ON public.user_roles;
CREATE TRIGGER trg_prevent_last_super_admin
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_super_admin_removal();

-- 5. Auto-bootstrap super_admin on new user creation if email is in allow-list
CREATE OR REPLACE FUNCTION public.bootstrap_super_admin_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.super_admin_bootstrap WHERE lower(email) = lower(NEW.email)) THEN
    INSERT INTO public.user_roles(user_id, role)
    VALUES (NEW.id, 'super_admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.role_change_logs(actor_id, target_user_id, role, action, reason)
    VALUES (NULL, NEW.id, 'super_admin'::app_role, 'bootstrap', 'auto-assigned from allow-list');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bootstrap_super_admin ON auth.users;
CREATE TRIGGER trg_bootstrap_super_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_super_admin_on_signup();

-- 6. Backfill for any already-registered allow-list users
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::app_role
FROM auth.users u
JOIN public.super_admin_bootstrap b ON lower(b.email) = lower(u.email)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.role_change_logs (actor_id, target_user_id, role, action, reason)
SELECT NULL, u.id, 'super_admin'::app_role, 'bootstrap', 'backfill'
FROM auth.users u
JOIN public.super_admin_bootstrap b ON lower(b.email) = lower(u.email)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_change_logs l
  WHERE l.target_user_id = u.id AND l.role = 'super_admin'::app_role AND l.action = 'bootstrap'
);

-- 7. Secure role-management RPC: only super_admins can grant/revoke
CREATE OR REPLACE FUNCTION public.manage_user_role(
  _target_user_id uuid,
  _role app_role,
  _grant boolean,
  _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super_admins can manage roles';
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles(user_id, role)
    VALUES (_target_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.role_change_logs(actor_id, target_user_id, role, action, reason)
    VALUES (auth.uid(), _target_user_id, _role, 'granted', _reason);
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _target_user_id AND role = _role;
    INSERT INTO public.role_change_logs(actor_id, target_user_id, role, action, reason)
    VALUES (auth.uid(), _target_user_id, _role, 'revoked', _reason);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.manage_user_role(uuid, app_role, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_user_role(uuid, app_role, boolean, text) TO authenticated;
