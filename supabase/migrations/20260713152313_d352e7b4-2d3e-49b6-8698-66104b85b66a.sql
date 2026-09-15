DROP POLICY IF EXISTS "Users can update their sent messages" ON public.messages;

-- Sender can edit their own message freely.
CREATE POLICY "Senders can update their sent messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);

-- Recipient can mark-as-read only: enforce that immutable fields stay unchanged.
CREATE POLICY "Recipients can mark received messages as read"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (
  auth.uid() = recipient_id
  AND sender_id    = (SELECT m.sender_id    FROM public.messages m WHERE m.id = messages.id)
  AND recipient_id = (SELECT m.recipient_id FROM public.messages m WHERE m.id = messages.id)
  AND content      IS NOT DISTINCT FROM (SELECT m.content    FROM public.messages m WHERE m.id = messages.id)
  AND subject      IS NOT DISTINCT FROM (SELECT m.subject    FROM public.messages m WHERE m.id = messages.id)
);