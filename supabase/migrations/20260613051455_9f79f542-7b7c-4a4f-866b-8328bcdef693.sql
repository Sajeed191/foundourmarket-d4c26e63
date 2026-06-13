-- Remove orphan payments referencing deleted/missing orders
DELETE FROM public.payments p
WHERE p.order_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p.order_id);

-- Prevent future orphan payments (order_items & shipments already cascade)
ALTER TABLE public.payments
  ADD CONSTRAINT payments_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;