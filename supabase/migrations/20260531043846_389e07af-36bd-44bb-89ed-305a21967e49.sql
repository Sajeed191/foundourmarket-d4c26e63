CREATE TABLE IF NOT EXISTS public.shipping_state (
  id boolean PRIMARY KEY DEFAULT true,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shipping_state_singleton CHECK (id = true)
);

GRANT SELECT ON public.shipping_state TO anon, authenticated;
GRANT ALL ON public.shipping_state TO service_role;

ALTER TABLE public.shipping_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipping state public read" ON public.shipping_state;
CREATE POLICY "shipping state public read"
ON public.shipping_state
FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.shipping_state (id, version, updated_at)
VALUES (true, 0, now())
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_shipping_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.shipping_state (id, version, updated_at)
  VALUES (true, 1, now())
  ON CONFLICT (id) DO UPDATE
    SET version = public.shipping_state.version + 1,
        updated_at = now();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS products_shipping_state_bump ON public.products;
CREATE TRIGGER products_shipping_state_bump
AFTER INSERT OR UPDATE OF shipping_fee_inr, shipping_fee_usd, category ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.bump_shipping_state();

DROP TRIGGER IF EXISTS categories_shipping_state_bump ON public.categories;
CREATE TRIGGER categories_shipping_state_bump
AFTER INSERT OR UPDATE OF shipping_fee_inr, shipping_fee_usd, free_shipping, slug ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.bump_shipping_state();

DROP TRIGGER IF EXISTS store_settings_shipping_state_bump ON public.store_settings;
CREATE TRIGGER store_settings_shipping_state_bump
AFTER UPDATE OF shipping_mode, free_shipping_enabled, flat_shipping_inr, flat_shipping_usd, free_shipping_threshold_inr, free_shipping_threshold_usd ON public.store_settings
FOR EACH ROW
EXECUTE FUNCTION public.bump_shipping_state();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shipping_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shipping_state;
  END IF;
END $$;