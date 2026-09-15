-- Drop duplicate policies that already exist, then skip
DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
DROP POLICY IF EXISTS "Users and admins can delete comments" ON public.comments;

-- Recreate with correct definitions
CREATE POLICY "Users can update own comments"
ON public.comments FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users and admins can delete comments"
ON public.comments FOR DELETE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));