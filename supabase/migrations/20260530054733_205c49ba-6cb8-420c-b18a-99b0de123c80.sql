
-- ============================================================
-- 1. is_seeded flags (additive, default false → real rows untouched)
-- ============================================================
ALTER TABLE public.profiles          ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders            ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_items       ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.payments          ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.shipments         ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.shipment_events   ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.returns           ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.return_items      ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.product_reviews   ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.product_questions ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.support_tickets   ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.support_messages  ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.analytics_events  ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.page_views        ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.search_logs       ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.wishlist          ADD COLUMN IF NOT EXISTS is_seeded boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_is_seeded           ON public.orders(is_seeded) WHERE is_seeded;
CREATE INDEX IF NOT EXISTS idx_analytics_events_is_seeded ON public.analytics_events(is_seeded) WHERE is_seeded;
CREATE INDEX IF NOT EXISTS idx_page_views_is_seeded       ON public.page_views(is_seeded) WHERE is_seeded;
CREATE INDEX IF NOT EXISTS idx_product_reviews_is_seeded  ON public.product_reviews(is_seeded) WHERE is_seeded;
CREATE INDEX IF NOT EXISTS idx_profiles_is_seeded         ON public.profiles(is_seeded) WHERE is_seeded;

-- ============================================================
-- 2. analytics toggle + seed run log
-- ============================================================
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS include_seed_in_analytics boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.seed_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seed_runs TO authenticated;
GRANT ALL ON public.seed_runs TO service_role;
ALTER TABLE public.seed_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view seed runs" ON public.seed_runs
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));

-- ============================================================
-- 3. seed_customers
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_customers(_count int DEFAULT 500)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  fnames text[] := ARRAY['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan','Ananya','Diya','Aadhya','Saanvi','Pari','Riya','Aisha','Meera','James','Olivia','Liam','Emma','Noah','Ava','William','Sophia','Lucas','Mia','Mateo','Chloe','Hiroshi','Yuki','Wei','Mei','Omar','Layla','Carlos','Sofia'];
  lnames text[] := ARRAY['Sharma','Verma','Patel','Reddy','Nair','Iyer','Gupta','Mehta','Khan','Singh','Smith','Johnson','Brown','Garcia','Muller','Rossi','Tanaka','Chen','Kim','Silva'];
  intl jsonb := '[{"c":"United States","cc":"US"},{"c":"United Kingdom","cc":"GB"},{"c":"Canada","cc":"CA"},{"c":"Australia","cc":"AU"},{"c":"Germany","cc":"DE"},{"c":"Singapore","cc":"SG"},{"c":"United Arab Emirates","cc":"AE"},{"c":"Japan","cc":"JP"}]'::jsonb;
  i int; uid uuid; fn text; ln text; is_in boolean; created timestamptz;
  v_country text; v_cc text; v_region text; e text; n int := 0; pick int;
BEGIN
  FOR i IN 1.._count LOOP
    uid := gen_random_uuid();
    fn := fnames[1+floor(random()*array_length(fnames,1))::int];
    ln := lnames[1+floor(random()*array_length(lnames,1))::int];
    is_in := random() < 0.6;
    created := now() - (random()*180 || ' days')::interval - (random()*86400 || ' seconds')::interval;
    IF is_in THEN
      v_country := 'India'; v_cc := 'IN'; v_region := 'india';
    ELSE
      pick := floor(random()*jsonb_array_length(intl))::int;
      v_country := intl->pick->>'c'; v_cc := intl->pick->>'cc'; v_region := 'international';
    END IF;
    e := 'seed+'||replace(uid::text,'-','')||'@seed.foundourmarket.com';
    INSERT INTO auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
    VALUES ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',e,
      extensions.crypt('seed-'||uid::text, extensions.gen_salt('bf')),created,created,created,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', fn||' '||ln),'','','','');
    UPDATE public.profiles
      SET is_seeded=true, full_name=fn||' '||ln, country=v_country, country_code=v_cc,
          market_region=v_region, created_at=created
      WHERE id=uid;
    n := n+1;
  END LOOP;
  INSERT INTO public.seed_runs(kind,counts) VALUES ('customers', jsonb_build_object('customers',n));
  RETURN n;
END $$;

-- ============================================================
-- 4. seed_orders
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_orders(_count int DEFAULT 1000)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uids uuid[]; i int; k int; nitems int; uid uuid; v_region text; v_country text;
  st text; pay_status text; ful text; pm text; ss text;
  v_slug text; v_price numeric; v_img text; v_unit int; v_qty int;
  v_sub int; v_ship int; v_tax int; v_total int; oid uuid; created timestamptz; r numeric; n int:=0;
BEGIN
  SELECT array_agg(id) INTO uids FROM public.profiles WHERE is_seeded;
  IF uids IS NULL THEN RAISE EXCEPTION 'No seeded customers. Run seed_customers first.'; END IF;
  ALTER TABLE public.orders DISABLE TRIGGER USER;
  ALTER TABLE public.order_items DISABLE TRIGGER USER;
  ALTER TABLE public.payments DISABLE TRIGGER USER;
  FOR i IN 1.._count LOOP
    uid := uids[1+floor(random()*array_length(uids,1))::int];
    SELECT market_region, country INTO v_region, v_country FROM public.profiles WHERE id=uid;
    created := now() - (random()*170 || ' days')::interval;
    r := random();
    st := CASE WHEN r<0.40 THEN 'delivered' WHEN r<0.55 THEN 'shipped' WHEN r<0.65 THEN 'paid'
               WHEN r<0.73 THEN 'confirmed' WHEN r<0.82 THEN 'cancelled' WHEN r<0.90 THEN 'refunded'
               ELSE 'pending' END;
    pay_status := CASE st WHEN 'cancelled' THEN 'failed' WHEN 'refunded' THEN 'refunded'
                          WHEN 'pending' THEN 'pending' WHEN 'confirmed' THEN 'pending'
                          ELSE 'succeeded' END;
    ful := CASE st WHEN 'delivered' THEN 'delivered' WHEN 'shipped' THEN 'shipped' ELSE 'unfulfilled' END;
    ss := CASE WHEN pay_status='succeeded' THEN 'committed' ELSE 'none' END;
    pm := CASE WHEN random()<0.7 THEN 'razorpay' ELSE 'cod' END;
    oid := gen_random_uuid();
    nitems := 1+floor(random()*3)::int;
    v_sub := 0;
    INSERT INTO public.orders(id,user_id,status,currency,subtotal,shipping,tax,discount,total,
      payment_method,payment_status,fulfillment_status,stock_state,market_region,
      contact_email,shipping_address,created_at,updated_at,is_seeded)
    VALUES(oid,uid,st,'INR',0,0,0,0,0,pm,pay_status,ful,ss,COALESCE(v_region,'india'),
      'seed+'||substr(uid::text,1,8)||'@seed.foundourmarket.com',
      jsonb_build_object('full_name','Seed Customer','line1','1 Demo Street','city',COALESCE(v_country,'India'),'country',COALESCE(v_country,'India')),
      created,created,true);
    FOR k IN 1..nitems LOOP
      SELECT slug, price, image INTO v_slug, v_price, v_img FROM public.products ORDER BY random() LIMIT 1;
      v_qty := 1+floor(random()*3)::int;
      v_unit := greatest(1, round(v_price*83))::int;
      v_sub := v_sub + v_unit*v_qty;
      INSERT INTO public.order_items(order_id,product_slug,name,image,unit_price,quantity,line_total,created_at,is_seeded)
      VALUES(oid,v_slug,initcap(replace(v_slug,'-',' ')),v_img,v_unit,v_qty,v_unit*v_qty,created,true);
    END LOOP;
    v_ship := CASE WHEN v_sub>=4150 THEN 0 ELSE 830 END;
    v_tax := round(v_sub*0.08)::int;
    v_total := v_sub+v_ship+v_tax;
    UPDATE public.orders SET subtotal=v_sub, shipping=v_ship, tax=v_tax, total=v_total WHERE id=oid;
    IF pay_status IN ('succeeded','refunded') THEN
      INSERT INTO public.payments(order_id,user_id,method,status,amount,currency,transaction_id,demo,created_at,is_seeded)
      VALUES(oid,uid,pm,CASE WHEN pay_status='refunded' THEN 'refunded' ELSE 'succeeded' END,
             v_total,'INR','seed_'||substr(replace(oid::text,'-',''),1,16),false,created,true);
    END IF;
    n := n+1;
  END LOOP;
  ALTER TABLE public.orders ENABLE TRIGGER USER;
  ALTER TABLE public.order_items ENABLE TRIGGER USER;
  ALTER TABLE public.payments ENABLE TRIGGER USER;
  INSERT INTO public.seed_runs(kind,counts) VALUES ('orders', jsonb_build_object('orders',n));
  RETURN n;
END $$;

-- ============================================================
-- 5. seed_shipments
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_shipments()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o record; sid uuid; carrier text; trk text; base timestamptz; n int:=0; idx int; flows text[];
  carriers text[] := ARRAY['BlueDart','Delhivery','DHL','FedEx','India Post','Ekart'];
BEGIN
  ALTER TABLE public.shipments DISABLE TRIGGER USER;
  ALTER TABLE public.shipment_events DISABLE TRIGGER USER;
  FOR o IN SELECT id, status, created_at, user_id FROM public.orders
           WHERE is_seeded AND status IN ('shipped','delivered')
             AND id NOT IN (SELECT order_id FROM public.shipments WHERE is_seeded) LOOP
    carrier := carriers[1+floor(random()*array_length(carriers,1))::int];
    trk := upper(substr(md5(random()::text),1,12));
    base := o.created_at + (1+random()*2 || ' days')::interval;
    INSERT INTO public.shipments(id,order_id,user_id,carrier,tracking_number,tracking_url,status,shipped_at,delivered_at,created_at,updated_at,is_seeded)
    VALUES(gen_random_uuid(),o.id,o.user_id,carrier,trk,'https://track.example.com/'||trk,
      CASE WHEN o.status='delivered' THEN 'delivered' ELSE 'in_transit' END,
      base, CASE WHEN o.status='delivered' THEN base+(2+random()*4||' days')::interval ELSE NULL END,
      o.created_at, now(), true)
    RETURNING id INTO sid;
    IF o.status='delivered' THEN flows := ARRAY['processing','packed','shipped','in_transit','out_for_delivery','delivered'];
    ELSE flows := ARRAY['processing','packed','shipped','in_transit']; END IF;
    FOR idx IN 1..array_length(flows,1) LOOP
      INSERT INTO public.shipment_events(id,shipment_id,status,description,location,occurred_at,created_at,is_seeded)
      VALUES(gen_random_uuid(),sid,flows[idx],initcap(replace(flows[idx],'_',' ')),
        CASE WHEN idx<=2 THEN 'Fulfilment Center' ELSE 'Transit Hub' END,
        base + ((idx-1)*0.8||' days')::interval, now(), true);
    END LOOP;
    n := n+1;
  END LOOP;
  ALTER TABLE public.shipments ENABLE TRIGGER USER;
  ALTER TABLE public.shipment_events ENABLE TRIGGER USER;
  INSERT INTO public.seed_runs(kind,counts) VALUES ('shipments', jsonb_build_object('shipments',n));
  RETURN n;
END $$;

-- ============================================================
-- 6. seed_reviews
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_reviews(_count int DEFAULT 1500)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uids uuid[]; slugs text[]; i int; uid uuid; slug text; rating int; r numeric; n int:=0; created timestamptz;
  titles text[] := ARRAY['Absolutely love it','Great value','Exceeded expectations','Solid purchase','Highly recommend','Pretty good','Works as described','Premium feel','Worth every rupee','Impressive quality'];
  bodies text[] := ARRAY['Shipping was fast and the build quality is fantastic. Using it daily.','Does exactly what it promises. Very happy with this.','Better than I expected for the price. Would buy again.','Good product overall, minor niggles but nothing major.','Packaging was premium and the product feels high end.','Setup was easy and it works flawlessly so far.','Reliable and well made. No complaints after weeks of use.','Looks even better in person. Great gift idea too.'];
BEGIN
  SELECT array_agg(id) INTO uids FROM public.profiles WHERE is_seeded;
  SELECT array_agg(slug) INTO slugs FROM public.products;
  IF uids IS NULL OR slugs IS NULL THEN RAISE EXCEPTION 'Seed customers and ensure products exist first.'; END IF;
  ALTER TABLE public.product_reviews DISABLE TRIGGER USER;
  FOR i IN 1.._count LOOP
    uid := uids[1+floor(random()*array_length(uids,1))::int];
    slug := slugs[1+floor(random()*array_length(slugs,1))::int];
    r := random();
    rating := CASE WHEN r<0.5 THEN 5 WHEN r<0.8 THEN 4 ELSE 3 END;
    created := now() - (random()*160 || ' days')::interval;
    INSERT INTO public.product_reviews(product_slug,user_id,rating,title,body,created_at,updated_at,is_seeded)
    VALUES(slug,uid,rating,titles[1+floor(random()*array_length(titles,1))::int],
           bodies[1+floor(random()*array_length(bodies,1))::int],created,created,true)
    ON CONFLICT DO NOTHING;
    n := n+1;
  END LOOP;
  ALTER TABLE public.product_reviews ENABLE TRIGGER USER;
  INSERT INTO public.seed_runs(kind,counts) VALUES ('reviews', jsonb_build_object('reviews',n));
  RETURN n;
END $$;

-- ============================================================
-- 7. seed_questions
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_questions(_count int DEFAULT 200)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uids uuid[]; slugs text[]; i int; uid uuid; slug text; n int:=0; created timestamptz; staff uuid; answered boolean;
  qs text[] := ARRAY['Is this compatible with my device?','What is the warranty period?','Does it ship internationally?','How long does delivery take?','Is the box sealed and original?','What is included in the package?','Is cash on delivery available?','Can I return it if it does not fit?'];
  ans text[] := ARRAY['Yes, it is compatible with all standard devices.','It comes with a 1-year manufacturer warranty.','Yes, we ship worldwide with tracked delivery.','Typically 2-5 business days depending on your region.','Absolutely, all items are sealed and 100% original.','The package includes the product, manual and accessories.','Yes, COD is available in most regions.','Yes, returns are accepted within 7 days.'];
BEGIN
  SELECT array_agg(id) INTO uids FROM public.profiles WHERE is_seeded;
  SELECT array_agg(slug) INTO slugs FROM public.products;
  IF uids IS NULL OR slugs IS NULL THEN RAISE EXCEPTION 'Seed customers and ensure products exist first.'; END IF;
  SELECT user_id INTO staff FROM public.user_roles WHERE role IN ('admin','super_admin','manager') LIMIT 1;
  ALTER TABLE public.product_questions DISABLE TRIGGER USER;
  FOR i IN 1.._count LOOP
    uid := uids[1+floor(random()*array_length(uids,1))::int];
    slug := slugs[1+floor(random()*array_length(slugs,1))::int];
    created := now() - (random()*120 || ' days')::interval;
    answered := random() < 0.7;
    INSERT INTO public.product_questions(product_slug,user_id,question,answer,answered_by,answered_at,created_at,updated_at,is_seeded)
    VALUES(slug,uid,qs[1+floor(random()*array_length(qs,1))::int],
      CASE WHEN answered THEN ans[1+floor(random()*array_length(ans,1))::int] ELSE NULL END,
      CASE WHEN answered THEN staff ELSE NULL END,
      CASE WHEN answered THEN created + (random()*2||' days')::interval ELSE NULL END,
      created, created, true);
    n := n+1;
  END LOOP;
  ALTER TABLE public.product_questions ENABLE TRIGGER USER;
  INSERT INTO public.seed_runs(kind,counts) VALUES ('questions', jsonb_build_object('questions',n));
  RETURN n;
END $$;

-- ============================================================
-- 8. seed_support
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_support(_count int DEFAULT 300)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uids uuid[]; i int; uid uuid; tid uuid; n int:=0; created timestamptz; staff uuid; r numeric;
  cat text; subj text; st text; prio text; nmsg int; m int; mt timestamptz;
  cats text[] := ARRAY['shipping','refund','product','delivery'];
  subj_ship text[] := ARRAY['Where is my order?','Shipment delayed','Tracking not updating'];
  subj_ref  text[] := ARRAY['Refund request','Refund not received','Cancel my order'];
  subj_prod text[] := ARRAY['Product question','Item not working','Wrong item received'];
  subj_del  text[] := ARRAY['Delivery complaint','Package damaged','Missing item in delivery'];
  cust_msgs text[] := ARRAY['Hi, I need help with my recent order. Could you please check?','It has been a few days and I have not received any update.','Please let me know how to proceed. Thank you.'];
  staff_msgs text[] := ARRAY['Thanks for reaching out! We are looking into this right away.','I have checked your order and escalated it to our logistics team.','This has been resolved on our end. Please let us know if you need anything else.'];
BEGIN
  SELECT array_agg(id) INTO uids FROM public.profiles WHERE is_seeded;
  IF uids IS NULL THEN RAISE EXCEPTION 'Seed customers first.'; END IF;
  SELECT user_id INTO staff FROM public.user_roles WHERE role IN ('admin','super_admin','manager','support') LIMIT 1;
  ALTER TABLE public.support_tickets DISABLE TRIGGER USER;
  ALTER TABLE public.support_messages DISABLE TRIGGER USER;
  FOR i IN 1.._count LOOP
    uid := uids[1+floor(random()*array_length(uids,1))::int];
    cat := cats[1+floor(random()*4)::int];
    subj := CASE cat
      WHEN 'shipping' THEN subj_ship[1+floor(random()*3)::int]
      WHEN 'refund' THEN subj_ref[1+floor(random()*3)::int]
      WHEN 'product' THEN subj_prod[1+floor(random()*3)::int]
      ELSE subj_del[1+floor(random()*3)::int] END;
    r := random();
    st := CASE WHEN r<0.25 THEN 'open' WHEN r<0.5 THEN 'pending' WHEN r<0.8 THEN 'resolved' ELSE 'closed' END;
    prio := (ARRAY['low','normal','high'])[1+floor(random()*3)::int];
    created := now() - (random()*90 || ' days')::interval;
    tid := gen_random_uuid();
    INSERT INTO public.support_tickets(id,user_id,subject,category,status,priority,market_region,assigned_to,last_message_at,resolved_at,created_at,updated_at,tags,is_seeded)
    VALUES(tid,uid,subj,cat,st,prio,(SELECT market_region FROM public.profiles WHERE id=uid),
      CASE WHEN st IN ('resolved','closed') THEN staff ELSE NULL END,
      created, CASE WHEN st IN ('resolved','closed') THEN created+(random()*3||' days')::interval ELSE NULL END,
      created, created, '{}'::text[], true);
    nmsg := 1+floor(random()*3)::int;
    mt := created;
    INSERT INTO public.support_messages(ticket_id,sender_id,sender_role,body,attachments,created_at,is_seeded)
    VALUES(tid,uid,'customer',cust_msgs[1+floor(random()*3)::int],'[]'::jsonb,mt,true);
    FOR m IN 1..nmsg LOOP
      mt := mt + (random()*1||' days')::interval;
      IF m % 2 = 1 AND staff IS NOT NULL THEN
        INSERT INTO public.support_messages(ticket_id,sender_id,sender_role,body,attachments,created_at,is_seeded)
        VALUES(tid,staff,'staff',staff_msgs[1+floor(random()*3)::int],'[]'::jsonb,mt,true);
      ELSE
        INSERT INTO public.support_messages(ticket_id,sender_id,sender_role,body,attachments,created_at,is_seeded)
        VALUES(tid,uid,'customer',cust_msgs[1+floor(random()*3)::int],'[]'::jsonb,mt,true);
      END IF;
    END LOOP;
    n := n+1;
  END LOOP;
  ALTER TABLE public.support_tickets ENABLE TRIGGER USER;
  ALTER TABLE public.support_messages ENABLE TRIGGER USER;
  INSERT INTO public.seed_runs(kind,counts) VALUES ('support', jsonb_build_object('support_tickets',n));
  RETURN n;
END $$;

-- ============================================================
-- 9. seed_returns
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_returns(_count int DEFAULT 120)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o record; rid uuid; oi record; n int:=0; st text; rfs text; created timestamptz; r numeric;
  reasons text[] := ARRAY['Item not as described','Changed my mind','Defective product','Wrong size','Arrived damaged','Better price elsewhere'];
BEGIN
  ALTER TABLE public.returns DISABLE TRIGGER USER;
  ALTER TABLE public.return_items DISABLE TRIGGER USER;
  FOR o IN SELECT id,user_id,total,created_at FROM public.orders
           WHERE is_seeded AND status IN ('delivered','refunded')
             AND id NOT IN (SELECT order_id FROM public.returns WHERE is_seeded)
           ORDER BY random() LIMIT _count LOOP
    r := random();
    st := CASE WHEN r<0.25 THEN 'requested' WHEN r<0.55 THEN 'approved' WHEN r<0.75 THEN 'rejected' ELSE 'completed' END;
    rfs := CASE st WHEN 'completed' THEN 'completed' WHEN 'rejected' THEN 'rejected' ELSE 'pending' END;
    created := o.created_at + (3+random()*10||' days')::interval;
    rid := gen_random_uuid();
    INSERT INTO public.returns(id,order_id,user_id,status,reason,notes,refund_amount,refund_status,resolved_at,created_at,updated_at,is_seeded)
    VALUES(rid,o.id,o.user_id,st,reasons[1+floor(random()*array_length(reasons,1))::int],NULL,
      CASE WHEN st IN ('approved','completed') THEN o.total ELSE 0 END,rfs,
      CASE WHEN st IN ('completed','rejected') THEN created+(random()*3||' days')::interval ELSE NULL END,
      created,created,true);
    FOR oi IN SELECT id, product_slug, quantity FROM public.order_items WHERE order_id=o.id LOOP
      INSERT INTO public.return_items(id,return_id,order_item_id,product_slug,quantity,reason,created_at,is_seeded)
      VALUES(gen_random_uuid(),rid,oi.id,oi.product_slug,oi.quantity,reasons[1+floor(random()*array_length(reasons,1))::int],created,true);
    END LOOP;
    n := n+1;
  END LOOP;
  ALTER TABLE public.returns ENABLE TRIGGER USER;
  ALTER TABLE public.return_items ENABLE TRIGGER USER;
  INSERT INTO public.seed_runs(kind,counts) VALUES ('returns', jsonb_build_object('returns',n));
  RETURN n;
END $$;

-- ============================================================
-- 10. seed_analytics
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_analytics(_days int DEFAULT 90)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; c int;
BEGIN
  INSERT INTO public.page_views(path,user_id,session_id,country,device,created_at,is_seeded)
  SELECT (ARRAY['/','/deals','/search','/wishlist','/cart','/products/'||p.slug,'/category/'||p.category])[1+floor(random()*7)::int],
         CASE WHEN random()<0.4 THEN (SELECT id FROM public.profiles WHERE is_seeded ORDER BY random() LIMIT 1) ELSE NULL END,
         'seed-'||substr(md5(random()::text),1,16),
         CASE WHEN random()<0.6 THEN 'India' ELSE 'United States' END,
         (ARRAY['mobile','desktop','tablet'])[1+floor(random()*3)::int],
         now() - (random()*_days||' days')::interval, true
  FROM generate_series(1, _days*80) g
  CROSS JOIN LATERAL (SELECT slug, category FROM public.products ORDER BY random() LIMIT 1) p;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  INSERT INTO public.analytics_events(user_id,session_id,event,path,product_slug,value,metadata,created_at,is_seeded)
  SELECT CASE WHEN random()<0.5 THEN (SELECT id FROM public.profiles WHERE is_seeded ORDER BY random() LIMIT 1) ELSE NULL END,
         'seed-'||substr(md5(random()::text),1,16), ev.e, '/products/'||p.slug, p.slug,
         CASE WHEN ev.e='purchase' THEN round(p.price*83) ELSE NULL END, '{}'::jsonb,
         now()-(random()*_days||' days')::interval, true
  FROM generate_series(1, _days*60) g
  CROSS JOIN LATERAL (SELECT (ARRAY['product_view','add_to_cart','wishlist_add','checkout_start','purchase'])[1+floor(random()*5)::int] e) ev
  CROSS JOIN LATERAL (SELECT slug, price FROM public.products ORDER BY random() LIMIT 1) p;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  INSERT INTO public.analytics_events(session_id,event,path,metadata,created_at,is_seeded)
  SELECT 'seed-'||substr(md5(random()::text),1,16),
         (ARRAY['section_impression','section_click'])[1+floor(random()*2)::int], '/',
         jsonb_build_object('section',(ARRAY['trending','recommended','new-arrivals'])[1+floor(random()*3)::int]),
         now()-(random()*_days||' days')::interval, true
  FROM generate_series(1, _days*30) g;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  INSERT INTO public.search_logs(query,results_count,user_id,session_id,clicked_product_slug,created_at,is_seeded)
  SELECT (ARRAY['headphones','watch','backpack','keyboard','sunglasses','earbuds','lamp','bottle','gaming','fashion'])[1+floor(random()*10)::int],
         floor(random()*8)::int,
         CASE WHEN random()<0.4 THEN (SELECT id FROM public.profiles WHERE is_seeded ORDER BY random() LIMIT 1) ELSE NULL END,
         'seed-'||substr(md5(random()::text),1,16),
         CASE WHEN random()<0.5 THEN (SELECT slug FROM public.products ORDER BY random() LIMIT 1) ELSE NULL END,
         now()-(random()*_days||' days')::interval, true
  FROM generate_series(1, _days*15) g;
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  INSERT INTO public.seed_runs(kind,counts) VALUES ('analytics', jsonb_build_object('analytics_rows',n));
  RETURN n;
END $$;

-- ============================================================
-- 11. remove_seed_data
-- ============================================================
CREATE OR REPLACE FUNCTION public.remove_seed_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE removed_users int;
BEGIN
  ALTER TABLE public.support_messages  DISABLE TRIGGER USER;
  ALTER TABLE public.support_tickets   DISABLE TRIGGER USER;
  ALTER TABLE public.return_items      DISABLE TRIGGER USER;
  ALTER TABLE public.returns           DISABLE TRIGGER USER;
  ALTER TABLE public.shipment_events   DISABLE TRIGGER USER;
  ALTER TABLE public.shipments         DISABLE TRIGGER USER;
  ALTER TABLE public.payments          DISABLE TRIGGER USER;
  ALTER TABLE public.order_items       DISABLE TRIGGER USER;
  ALTER TABLE public.orders            DISABLE TRIGGER USER;
  ALTER TABLE public.product_reviews   DISABLE TRIGGER USER;
  ALTER TABLE public.product_questions DISABLE TRIGGER USER;

  DELETE FROM public.support_messages  WHERE is_seeded;
  DELETE FROM public.support_ticket_reads WHERE ticket_id IN (SELECT id FROM public.support_tickets WHERE is_seeded);
  DELETE FROM public.support_internal_notes WHERE ticket_id IN (SELECT id FROM public.support_tickets WHERE is_seeded);
  DELETE FROM public.support_tickets   WHERE is_seeded;
  DELETE FROM public.return_items      WHERE is_seeded;
  DELETE FROM public.returns           WHERE is_seeded;
  DELETE FROM public.shipment_events   WHERE is_seeded;
  DELETE FROM public.shipments         WHERE is_seeded;
  DELETE FROM public.payments          WHERE is_seeded;
  DELETE FROM public.order_items       WHERE is_seeded;
  DELETE FROM public.orders            WHERE is_seeded;
  DELETE FROM public.product_reviews   WHERE is_seeded;
  DELETE FROM public.product_questions WHERE is_seeded;
  DELETE FROM public.analytics_events  WHERE is_seeded;
  DELETE FROM public.page_views        WHERE is_seeded;
  DELETE FROM public.search_logs       WHERE is_seeded;
  DELETE FROM public.wishlist          WHERE is_seeded;
  DELETE FROM public.customer_notes    WHERE user_id IN (SELECT id FROM public.profiles WHERE is_seeded);
  DELETE FROM public.customer_tags     WHERE user_id IN (SELECT id FROM public.profiles WHERE is_seeded);

  ALTER TABLE public.support_messages  ENABLE TRIGGER USER;
  ALTER TABLE public.support_tickets   ENABLE TRIGGER USER;
  ALTER TABLE public.return_items      ENABLE TRIGGER USER;
  ALTER TABLE public.returns           ENABLE TRIGGER USER;
  ALTER TABLE public.shipment_events   ENABLE TRIGGER USER;
  ALTER TABLE public.shipments         ENABLE TRIGGER USER;
  ALTER TABLE public.payments          ENABLE TRIGGER USER;
  ALTER TABLE public.order_items       ENABLE TRIGGER USER;
  ALTER TABLE public.orders            ENABLE TRIGGER USER;
  ALTER TABLE public.product_reviews   ENABLE TRIGGER USER;
  ALTER TABLE public.product_questions ENABLE TRIGGER USER;

  DELETE FROM public.profiles WHERE is_seeded;
  DELETE FROM auth.users WHERE email LIKE 'seed+%@seed.foundourmarket.com';
  GET DIAGNOSTICS removed_users = ROW_COUNT;
  DELETE FROM public.seed_runs WHERE true;

  RETURN jsonb_build_object('removed_users', removed_users, 'ok', true);
END $$;

-- ============================================================
-- 12. seed_all + get_seed_status
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_seed_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'customers',(SELECT count(*) FROM public.profiles WHERE is_seeded),
    'orders',(SELECT count(*) FROM public.orders WHERE is_seeded),
    'reviews',(SELECT count(*) FROM public.product_reviews WHERE is_seeded),
    'questions',(SELECT count(*) FROM public.product_questions WHERE is_seeded),
    'support_tickets',(SELECT count(*) FROM public.support_tickets WHERE is_seeded),
    'returns',(SELECT count(*) FROM public.returns WHERE is_seeded),
    'shipments',(SELECT count(*) FROM public.shipments WHERE is_seeded),
    'payments',(SELECT count(*) FROM public.payments WHERE is_seeded),
    'analytics_events',(SELECT count(*) FROM public.analytics_events WHERE is_seeded),
    'page_views',(SELECT count(*) FROM public.page_views WHERE is_seeded),
    'include_in_analytics',(SELECT include_seed_in_analytics FROM public.store_settings LIMIT 1),
    'last_run',(SELECT to_jsonb(s) FROM public.seed_runs s ORDER BY created_at DESC LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.seed_all(_scale numeric DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_customers(greatest(1,(500*_scale)::int));
  PERFORM public.seed_orders(greatest(1,(1000*_scale)::int));
  PERFORM public.seed_shipments();
  PERFORM public.seed_reviews(greatest(1,(1500*_scale)::int));
  PERFORM public.seed_questions(greatest(1,(200*_scale)::int));
  PERFORM public.seed_support(greatest(1,(300*_scale)::int));
  PERFORM public.seed_returns(greatest(1,(120*_scale)::int));
  PERFORM public.seed_analytics(90);
  RETURN public.get_seed_status();
END $$;

-- ============================================================
-- 13. lock down execution to service_role only
-- ============================================================
REVOKE ALL ON FUNCTION public.seed_customers(int)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_orders(int)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_shipments()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_reviews(int)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_questions(int)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_support(int)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_returns(int)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_analytics(int)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_all(numeric)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_seed_data()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_seed_status()     FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.seed_customers(int)   TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_orders(int)      TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_shipments()      TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_reviews(int)     TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_questions(int)   TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_support(int)     TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_returns(int)     TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_analytics(int)   TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_all(numeric)     TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_seed_data()    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_seed_status()     TO service_role;
