
-- Extend role enum for granular admin permissions
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'warehouse_staff';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';
