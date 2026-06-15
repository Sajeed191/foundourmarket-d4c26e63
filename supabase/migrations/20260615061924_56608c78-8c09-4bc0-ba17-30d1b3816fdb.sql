ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_number
  SET DEFAULT ('FOM-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0'));