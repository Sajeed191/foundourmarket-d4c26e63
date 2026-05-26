
DROP TRIGGER IF EXISTS trg_notify_order_status ON public.orders;
CREATE TRIGGER trg_notify_order_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_status();

DROP TRIGGER IF EXISTS trg_notify_shipment_event ON public.shipment_events;
CREATE TRIGGER trg_notify_shipment_event
AFTER INSERT ON public.shipment_events
FOR EACH ROW EXECUTE FUNCTION public.notify_shipment_event();

DROP TRIGGER IF EXISTS trg_notify_return_status ON public.returns;
CREATE TRIGGER trg_notify_return_status
AFTER UPDATE OF status ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.notify_return_status();
