ALTER TABLE public.shipments REPLICA IDENTITY FULL;
ALTER TABLE public.shipment_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipment_events;