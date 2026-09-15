ALTER TABLE public.doubt_replies
  ADD COLUMN IF NOT EXISTS parent_reply_id uuid
    REFERENCES public.doubt_replies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_doubt_replies_parent
  ON public.doubt_replies(parent_reply_id);