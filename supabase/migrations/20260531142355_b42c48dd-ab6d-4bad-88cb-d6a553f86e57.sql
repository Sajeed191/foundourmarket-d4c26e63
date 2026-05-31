-- Drop the redundant 6-argument overload of notify_roles.
-- The 7-argument version (with _priority DEFAULT 'normal') covers the same
-- behavior, so any 6-argument caller (e.g. the new-question trigger) now
-- resolves unambiguously to it instead of failing with "function is not unique".
DROP FUNCTION IF EXISTS public.notify_roles(app_role[], text, text, text, text, jsonb);