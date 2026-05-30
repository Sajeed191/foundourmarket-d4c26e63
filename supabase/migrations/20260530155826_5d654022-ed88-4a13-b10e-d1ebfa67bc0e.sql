
-- ============================================================
-- P1-2/3/4: Remove legacy triggers that conflict with the
-- reserve/commit inventory flow (double-deduction + dup logs)
-- ============================================================

-- Legacy: decremented stock_quantity on order_items INSERT. The modern flow
-- (reserve_order_stock -> commit_order_stock) is the single source of truth,
-- so this caused stock to be deducted twice per order.
DROP TRIGGER IF EXISTS order_items_decrement_stock ON public.order_items;

-- Legacy: logged an inventory movement on order_items INSERT. commit_order_stock
-- already writes the inventory_logs entry, so this duplicated every log row.
DROP TRIGGER IF EXISTS trg_log_inventory_on_order_item ON public.order_items;

-- Duplicate low-stock notifier (two triggers calling the same function).
-- Keep trg_low_stock_notify (scoped to stock_quantity/reserved_quantity updates).
DROP TRIGGER IF EXISTS trg_ops_notify_low_stock ON public.products;

-- ============================================================
-- P1-6: Idempotency / duplicate-protection at the database level
-- ============================================================

-- One payment row per gateway payment id (webhook retries + checkout handshake
-- can both attempt an insert concurrently; the unique index makes it safe).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_razorpay_payment_id
  ON public.payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- One refund row per gateway refund id (webhook retries cannot double-insert).
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_razorpay_refund_id
  ON public.refunds (razorpay_refund_id)
  WHERE razorpay_refund_id IS NOT NULL;
