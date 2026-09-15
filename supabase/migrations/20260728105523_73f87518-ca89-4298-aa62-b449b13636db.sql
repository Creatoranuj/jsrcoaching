REVOKE EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_enrollment_for_attendance(bigint, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_student_doubt_teacher_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.student_id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'teacher')
  THEN
    NEW.teacher_id := OLD.teacher_id;
    NEW.student_id := OLD.student_id;
    NEW.zoom_meeting_id := OLD.zoom_meeting_id;
    NEW.zoom_join_url := OLD.zoom_join_url;
    NEW.zoom_password := OLD.zoom_password;
    NEW.zoom_meeting_number := OLD.zoom_meeting_number;
    NEW.scheduled_at := OLD.scheduled_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_student_doubt_teacher_change ON public.doubt_sessions;
CREATE TRIGGER trg_prevent_student_doubt_teacher_change
BEFORE UPDATE ON public.doubt_sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_student_doubt_teacher_change();

REVOKE EXECUTE ON FUNCTION public.prevent_student_doubt_teacher_change() FROM PUBLIC, anon, authenticated;