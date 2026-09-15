DO $$
BEGIN
  -- Enable realtime on live_messages (idempotent check)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_messages;
  END IF;
END $$;

-- Add index for live chat performance
CREATE INDEX IF NOT EXISTS idx_live_messages_session_created 
ON public.live_messages(session_id, created_at);