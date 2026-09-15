CREATE OR REPLACE FUNCTION public.get_post_reactions(_post_ids uuid[])
RETURNS TABLE(post_id uuid, like_count bigint, liked_by_me boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.post_id,
         COUNT(*)::bigint AS like_count,
         BOOL_OR(r.user_id = auth.uid()) AS liked_by_me
  FROM public.community_reactions r
  WHERE r.post_id = ANY(_post_ids)
  GROUP BY r.post_id
$$;

REVOKE ALL ON FUNCTION public.get_post_reactions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_post_reactions(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_post_reactions(uuid[]) TO service_role;