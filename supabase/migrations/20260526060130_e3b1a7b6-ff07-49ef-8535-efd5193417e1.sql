ALTER TABLE public.products ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(featured) WHERE featured = true;