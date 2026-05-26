
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all notifications" ON public.notifications
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles));
$$;

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  session_id TEXT,
  event TEXT NOT NULL,
  path TEXT,
  referrer TEXT,
  product_slug TEXT,
  value NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_event_time ON public.analytics_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON public.analytics_events(user_id, created_at DESC);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert analytics events" ON public.analytics_events
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins read analytics events" ON public.analytics_events
  FOR SELECT USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE OR REPLACE FUNCTION public.notify_order_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.notifications(user_id, type, title, body, link, data)
    VALUES (NEW.user_id, 'order_status',
            'Order ' || NEW.status,
            'Your order #' || substr(NEW.id::text,1,8) || ' is now ' || NEW.status || '.',
            '/orders/' || NEW.id::text,
            jsonb_build_object('order_id', NEW.id, 'status', NEW.status));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_order_status ON public.orders;
CREATE TRIGGER trg_notify_order_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_status();

CREATE OR REPLACE FUNCTION public.notify_shipment_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u UUID;
BEGIN
  SELECT user_id INTO u FROM public.orders WHERE id = NEW.order_id;
  IF u IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, body, link, data)
    VALUES (u, 'shipment',
            'Shipment update: ' || NEW.status,
            COALESCE(NEW.description, 'Your shipment status changed to ' || NEW.status),
            '/orders/' || NEW.order_id::text,
            jsonb_build_object('shipment_id', NEW.shipment_id, 'status', NEW.status));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_shipment_event ON public.shipment_events;
CREATE TRIGGER trg_notify_shipment_event
AFTER INSERT ON public.shipment_events
FOR EACH ROW EXECUTE FUNCTION public.notify_shipment_event();

CREATE OR REPLACE FUNCTION public.notify_return_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.notifications(user_id, type, title, body, link, data)
    VALUES (NEW.user_id, 'return',
            'Return ' || NEW.status,
            'Your return request is now ' || NEW.status || '.',
            '/account/returns',
            jsonb_build_object('return_id', NEW.id, 'status', NEW.status));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_return_status ON public.returns;
CREATE TRIGGER trg_notify_return_status
AFTER UPDATE OF status ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.notify_return_status();
