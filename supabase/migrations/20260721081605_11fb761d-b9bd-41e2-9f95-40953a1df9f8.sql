
CREATE OR REPLACE FUNCTION public.get_product_qa(_slug text)
RETURNS TABLE (
  questions jsonb,
  my_answer_votes uuid[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  WITH q AS (
    SELECT
      pq.id, pq.product_slug, pq.question, pq.details, pq.is_anonymous,
      pq.status, pq.helpful_count, pq.created_at, pq.user_id,
      (uid = pq.user_id) AS is_mine,
      CASE WHEN pq.is_anonymous THEN NULL ELSE pr.full_name END AS author_name,
      CASE WHEN pq.is_anonymous THEN NULL ELSE pr.avatar_url END AS author_avatar
    FROM public.product_questions pq
    LEFT JOIN public.profiles pr ON pr.id = pq.user_id
    WHERE pq.product_slug = _slug
      AND pq.deleted_at IS NULL
      AND pq.status = 'visible'
  ),
  a AS (
    SELECT
      pa.id, pa.question_id, pa.parent_answer_id, pa.user_id, pa.body,
      pa.is_official, pa.is_store_response, pa.helpful_count,
      pa.created_at, pa.updated_at,
      (uid = pa.user_id) AS is_mine,
      pr.full_name AS author_name,
      pr.avatar_url AS author_avatar
    FROM public.product_answers pa
    LEFT JOIN public.profiles pr ON pr.id = pa.user_id
    WHERE pa.question_id IN (SELECT id FROM q)
      AND pa.status = 'visible'
      AND pa.deleted_at IS NULL
  ),
  qa_agg AS (
    SELECT q.id AS question_id, jsonb_agg(to_jsonb(a.*) ORDER BY a.is_official DESC, a.created_at ASC) AS answers
    FROM q
    LEFT JOIN a ON a.question_id = q.id
    GROUP BY q.id
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', q.id,
      'product_slug', q.product_slug,
      'question', q.question,
      'details', q.details,
      'is_anonymous', q.is_anonymous,
      'status', q.status,
      'helpful_count', q.helpful_count,
      'created_at', q.created_at,
      'is_mine', q.is_mine,
      'author_name', q.author_name,
      'author_avatar', q.author_avatar,
      'answers', COALESCE(qa_agg.answers, '[]'::jsonb)
    ) ORDER BY q.created_at DESC), '[]'::jsonb) AS questions,
    COALESCE(
      (SELECT array_agg(answer_id) FROM public.product_answer_votes
        WHERE user_id = uid AND answer_id IN (SELECT id FROM a)),
      ARRAY[]::uuid[]
    ) AS my_answer_votes
  FROM q
  LEFT JOIN qa_agg ON qa_agg.question_id = q.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_qa(text) TO anon, authenticated;
