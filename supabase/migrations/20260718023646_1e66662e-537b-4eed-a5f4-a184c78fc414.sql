
CREATE TABLE public.landing_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  badge TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  faculty TEXT NOT NULL DEFAULT 'Raj VIP Sir',
  language TEXT NOT NULL DEFAULT 'Hindi medium friendly',
  duration TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  seats TEXT,
  price_mrp INT,
  price_effective INT,
  short TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  route TEXT,
  course_id BIGINT REFERENCES public.courses(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.landing_courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_courses TO authenticated;
GRANT ALL ON public.landing_courses TO service_role;

ALTER TABLE public.landing_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active landing courses"
  ON public.landing_courses FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert landing courses"
  ON public.landing_courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update landing courses"
  ON public.landing_courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete landing courses"
  ON public.landing_courses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_landing_courses_updated_at
  BEFORE UPDATE ON public.landing_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.landing_courses (slug, badge, title, faculty, language, duration, start_date, seats, price_mrp, price_effective, short, route, position) VALUES
  ('up-board', 'UP Board', 'UP Board English — Class 9 to 12', 'Raj VIP Sir', 'Hindi medium friendly', '9 months · 220+ lessons', 'Naya batch: 5 Aug 2026', 'Limited seats', 2999, 999, 'Prose, poetry, grammar aur writing skills — pura UP Board syllabus, chapter-wise.', '/up-board-english', 0),
  ('cbse', 'CBSE', 'CBSE English — Grammar & Writing', 'Raj VIP Sir', 'Hindi + English', '10 weeks · 72 lessons', 'Naya batch: 12 Aug 2026', '40 seats left', 1999, 799, 'Grammar, reading comprehension aur board-pattern answer writing — chapter-wise practice.', '/cbse-english', 1),
  ('cg-lecturer', 'CG Lecturer', 'CG Lecturer English — Full Prep', 'Raj VIP Sir', 'Hindi + English', '16 weeks · 120+ lessons', 'Naya batch: 20 Aug 2026', '60 seats', 4999, 1499, 'Chhattisgarh Lecturer English paper — literature, linguistics, methodology aur previous year papers.', '/cg-lecturer-english', 2),
  ('spoken-english', 'Spoken', 'Spoken English & Interview Prep', 'Raj VIP Sir', 'Hindi medium friendly', '8 weeks · 60 lessons', 'Rolling admission', NULL, 1499, 499, 'Daily-use English, roleplay aur interview confidence — beginner se conversational fluency tak.', NULL, 3);
