CREATE OR REPLACE FUNCTION public.customer_product_state(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'purchased', true,
        'status', o.status,
        'delivered', (o.status IN ('delivered','completed')),
        'purchased_at', o.created_at,
        'delivered_at', o.fulfilled_at
      )
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.user_id = auth.uid()
        AND oi.product_slug = _slug
      ORDER BY (o.status IN ('delivered','completed')) DESC, o.created_at DESC
      LIMIT 1
    ),
    jsonb_build_object('purchased', false, 'delivered', false)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.customer_product_state(text) TO authenticated;