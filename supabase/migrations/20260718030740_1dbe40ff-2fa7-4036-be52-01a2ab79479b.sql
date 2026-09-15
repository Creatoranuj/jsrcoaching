CREATE TABLE public.landing_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  exam_track text,
  quote text NOT NULL,
  avatar_url text,
  rating smallint NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.landing_testimonials TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.landing_testimonials TO authenticated;
GRANT ALL ON public.landing_testimonials TO service_role;

ALTER TABLE public.landing_testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active testimonials"
  ON public.landing_testimonials FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert testimonials"
  ON public.landing_testimonials FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update testimonials"
  ON public.landing_testimonials FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete testimonials"
  ON public.landing_testimonials FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_landing_testimonials_updated_at
  BEFORE UPDATE ON public.landing_testimonials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.landing_testimonials (student_name, exam_track, quote, rating, position) VALUES
('Anjali Verma', 'UP Board', 'Raj Sir ki classes ke baad meri English writing bahut improve hui. Board exam mein 92 aaye!', 5, 1),
('Rohit Kumar', 'CG Lecturer', 'Structured notes aur live doubts ne CG Lecturer prep ko aasan bana diya. Highly recommend.', 5, 2),
('Priya Sharma', 'Spoken English', 'Confidence se English bolna seekha. Ab interviews mein hesitate nahi hoti.', 5, 3);