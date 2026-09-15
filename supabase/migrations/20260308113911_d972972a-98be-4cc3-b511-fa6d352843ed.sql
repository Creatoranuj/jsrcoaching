-- Create hero_banners table
CREATE TABLE public.hero_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  description text,
  image_url text,
  bg_color text NOT NULL DEFAULT '#1e40af',
  badge_text text,
  cta_text text NOT NULL DEFAULT 'Explore Now',
  cta_link text NOT NULL DEFAULT '/courses',
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hero_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active banners"
  ON public.hero_banners FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage banners"
  ON public.hero_banners FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.update_hero_banners_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER update_hero_banners_updated_at
  BEFORE UPDATE ON public.hero_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_hero_banners_updated_at();

INSERT INTO public.hero_banners (title, subtitle, description, bg_color, badge_text, cta_text, cta_link, position, is_active) VALUES
(
  'GET 40% OFF On All Batches!',
  'Limited Time Offer',
  'Enroll now in JEE & NEET Foundation courses. Top faculty, proven results.',
  'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
  '🎉 Special Offer',
  'Enroll Now',
  '/courses',
  0,
  true
),
(
  'NEET 2026 Target Batch',
  'New Batch Starting Soon',
  'Comprehensive coverage of Physics, Chemistry & Biology by expert faculty.',
  'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
  '🔬 NEET 2026',
  'Register Now',
  '/courses',
  1,
  true
),
(
  'Free Scholarship Test!',
  'Upto 100% Fee Waiver',
  'Attempt our online scholarship test and win upto 100% fee waiver on all courses.',
  'linear-gradient(135deg, #059669 0%, #047857 100%)',
  '🏆 Scholarship',
  'Attempt Free Test',
  '/all-tests',
  2,
  true
);