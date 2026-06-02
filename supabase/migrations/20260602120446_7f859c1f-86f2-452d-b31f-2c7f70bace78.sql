drop view if exists public.product_questions_public;

create or replace function public.get_product_questions(_slug text)
returns table (
  id uuid,
  product_slug text,
  question text,
  answer text,
  answered_at timestamptz,
  created_at timestamptz,
  is_mine boolean,
  author_name text,
  author_avatar text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.id,
    q.product_slug,
    q.question,
    q.answer,
    q.answered_at,
    q.created_at,
    (auth.uid() = q.user_id) as is_mine,
    p.full_name  as author_name,
    p.avatar_url as author_avatar
  from public.product_questions q
  left join public.profiles p on p.id = q.user_id
  where q.product_slug = _slug
  order by q.created_at desc
$$;

grant execute on function public.get_product_questions(text) to anon, authenticated;