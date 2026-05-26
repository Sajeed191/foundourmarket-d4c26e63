
ALTER TABLE public.return_items
  ADD CONSTRAINT return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.returns(id) ON DELETE CASCADE;

ALTER TABLE public.shipment_events
  ADD CONSTRAINT shipment_events_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE CASCADE;

ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE public.returns
  ADD CONSTRAINT returns_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
