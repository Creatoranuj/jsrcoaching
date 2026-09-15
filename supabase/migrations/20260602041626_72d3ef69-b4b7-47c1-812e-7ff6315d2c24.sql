DROP VIEW IF EXISTS public.lesson_video_meta;
CREATE VIEW public.lesson_video_meta WITH (security_invoker = true) AS
SELECT id, youtube_id, duration_seconds, is_free, is_preview, title, course_id
FROM public.lessons;
GRANT SELECT ON public.lesson_video_meta TO authenticated, anon;