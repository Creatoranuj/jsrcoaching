GRANT EXECUTE ON FUNCTION public.get_course_bundle(bigint)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_lesson_stats()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_lectures(text, integer) TO authenticated;