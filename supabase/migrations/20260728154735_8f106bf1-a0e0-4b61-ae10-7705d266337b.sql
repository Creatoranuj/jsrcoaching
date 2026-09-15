DROP POLICY IF EXISTS "Authenticated users view posts" ON public.community_posts;
CREATE POLICY "Authenticated users view posts"
ON public.community_posts
FOR SELECT
TO authenticated
USING (
  is_hidden = false
  OR author_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Authenticated users view comments" ON public.community_comments;
CREATE POLICY "Authenticated users view comments"
ON public.community_comments
FOR SELECT
TO authenticated
USING (
  (
    is_hidden = false
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  AND EXISTS (
    SELECT 1 FROM public.community_posts p
     WHERE p.id = community_comments.post_id
       AND (
         p.is_hidden = false
         OR p.author_id = auth.uid()
         OR public.has_role(auth.uid(), 'admin'::app_role)
       )
  )
);