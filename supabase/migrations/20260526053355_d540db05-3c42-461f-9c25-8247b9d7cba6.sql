
-- Role enum
do $$ begin
  create type public.app_role as enum ('admin','customer');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create policy "read own roles" on public.user_roles
  for select using (auth.uid() = user_id);

-- Security definer check
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- Admin can view all orders / items
create policy "admins view all orders" on public.orders
  for select using (public.has_role(auth.uid(),'admin'));
create policy "admins update all orders" on public.orders
  for update using (public.has_role(auth.uid(),'admin'));
create policy "admins view all order items" on public.order_items
  for select using (public.has_role(auth.uid(),'admin'));
