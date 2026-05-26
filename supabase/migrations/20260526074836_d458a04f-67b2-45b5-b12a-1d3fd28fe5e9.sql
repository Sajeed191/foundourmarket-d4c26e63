-- email_logs
CREATE TABLE public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  recipient text NOT NULL,
  template text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb,
  related_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_logs_user ON public.email_logs(user_id);
CREATE INDEX idx_email_logs_order ON public.email_logs(related_order_id);
CREATE INDEX idx_email_logs_status ON public.email_logs(status);
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own email logs select" ON public.email_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admins email logs select" ON public.email_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins email logs update" ON public.email_logs FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER email_logs_updated_at BEFORE UPDATE ON public.email_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- email_preferences
CREATE TABLE public.email_preferences (
  user_id uuid PRIMARY KEY,
  order_updates boolean NOT NULL DEFAULT true,
  shipping_updates boolean NOT NULL DEFAULT true,
  return_updates boolean NOT NULL DEFAULT true,
  marketing boolean NOT NULL DEFAULT false,
  abandoned_cart boolean NOT NULL DEFAULT true,
  product_news boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own prefs select" ON public.email_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.email_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.email_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "admins prefs select" ON public.email_preferences FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER email_preferences_updated_at BEFORE UPDATE ON public.email_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- abandoned cart tracking
ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS abandoned_cart_sent_at timestamptz;