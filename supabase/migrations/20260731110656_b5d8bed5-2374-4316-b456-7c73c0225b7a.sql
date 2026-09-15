-- Trigger-only function: must never be directly callable via the API.
REVOKE ALL ON FUNCTION public.prevent_profile_moderation_tampering()
  FROM PUBLIC, anon, authenticated;

-- Pre-login visitors do not need any of these; every consuming route is
-- behind ProtectedRoute, and the edge functions use the service role.
REVOKE SELECT ON public.books              FROM anon;
REVOKE SELECT ON public.chapters           FROM anon;
REVOKE SELECT ON public.chatbot_faq        FROM anon;
REVOKE SELECT ON public.earning_links      FROM anon;
REVOKE SELECT ON public.knowledge_base     FROM anon;
REVOKE SELECT ON public.subscription_plans FROM anon;