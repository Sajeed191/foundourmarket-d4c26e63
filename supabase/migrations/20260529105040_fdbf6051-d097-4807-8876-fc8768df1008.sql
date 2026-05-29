-- 1. razorpay_customers
CREATE TABLE public.razorpay_customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  razorpay_customer_id text NOT NULL UNIQUE,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.razorpay_customers TO authenticated;
GRANT ALL ON public.razorpay_customers TO service_role;

ALTER TABLE public.razorpay_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own razorpay customer select"
ON public.razorpay_customers FOR SELECT
USING (auth.uid() = user_id);

-- 2. saved_payment_methods
CREATE TABLE public.saved_payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  razorpay_customer_id text NOT NULL,
  razorpay_token_id text NOT NULL,
  provider text NOT NULL DEFAULT 'razorpay',
  payment_type text NOT NULL DEFAULT 'card',
  brand text,
  last4 text,
  expiry_month integer,
  expiry_year integer,
  upi_vpa text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, razorpay_token_id)
);

CREATE INDEX idx_spm_user ON public.saved_payment_methods(user_id);

GRANT SELECT, UPDATE, DELETE ON public.saved_payment_methods TO authenticated;
GRANT ALL ON public.saved_payment_methods TO service_role;

ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own payment methods select"
ON public.saved_payment_methods FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "own payment methods update"
ON public.saved_payment_methods FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own payment methods delete"
ON public.saved_payment_methods FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "admins view all payment methods"
ON public.saved_payment_methods FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

-- 3. tokenization_logs (admin observability)
CREATE TABLE public.tokenization_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  razorpay_customer_id text,
  razorpay_token_id text,
  payment_type text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tokenization_logs_created ON public.tokenization_logs(created_at DESC);

GRANT ALL ON public.tokenization_logs TO service_role;

ALTER TABLE public.tokenization_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read tokenization logs"
ON public.tokenization_logs FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

-- timestamp triggers
CREATE TRIGGER set_razorpay_customers_updated_at
BEFORE UPDATE ON public.razorpay_customers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_saved_payment_methods_updated_at
BEFORE UPDATE ON public.saved_payment_methods
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- enforce single default per user
CREATE OR REPLACE FUNCTION public.enforce_single_default_payment_method()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.saved_payment_methods
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_single_default_payment_method
AFTER INSERT OR UPDATE OF is_default ON public.saved_payment_methods
FOR EACH ROW WHEN (NEW.is_default = true)
EXECUTE FUNCTION public.enforce_single_default_payment_method();

-- realtime
ALTER TABLE public.saved_payment_methods REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_payment_methods;