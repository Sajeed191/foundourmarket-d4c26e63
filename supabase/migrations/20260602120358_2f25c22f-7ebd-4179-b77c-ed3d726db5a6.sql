create or replace view public.product_questions_public
with (security_invoker = false) as
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
left join public.profiles p on p.id = q.user_id;

grant select on public.product_questions_public to anon, authenticated;

drop policy if exists "votes viewable by everyone" on public.review_votes;

create policy "own votes viewable"
  on public.review_votes
  for select
  to authenticated
  using (auth.uid() = user_id);