CREATE TABLE public.product_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL REFERENCES public.products(slug) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_faqs_slug_order ON public.product_faqs (product_slug, sort_order);
CREATE UNIQUE INDEX uq_product_faqs_slug_question ON public.product_faqs (product_slug, lower(question));

GRANT SELECT ON public.product_faqs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_faqs TO authenticated;
GRANT ALL ON public.product_faqs TO service_role;

ALTER TABLE public.product_faqs ENABLE ROW LEVEL SECURITY;

-- Customers (anon + authenticated) can read only active FAQs
CREATE POLICY "Public can read active product faqs"
ON public.product_faqs FOR SELECT
USING (is_active = true);

-- Admin roles can read every FAQ (including inactive) for management
CREATE POLICY "Admins can read all product faqs"
ON public.product_faqs FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
);

-- Only admin roles can create FAQs
CREATE POLICY "Admins can insert product faqs"
ON public.product_faqs FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
);

-- Only admin roles can edit / reorder / toggle FAQs
CREATE POLICY "Admins can update product faqs"
ON public.product_faqs FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
);

-- Only admin roles can delete FAQs
CREATE POLICY "Admins can delete product faqs"
ON public.product_faqs FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
);

-- Keep updated_at fresh
CREATE TRIGGER update_product_faqs_updated_at
BEFORE UPDATE ON public.product_faqs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();