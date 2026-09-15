
-- Create quizzes table
CREATE TABLE public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('dpp', 'test')) DEFAULT 'dpp',
  course_id BIGINT REFERENCES public.courses(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
  duration_minutes INTEGER DEFAULT 0,
  total_marks INTEGER DEFAULT 0,
  pass_percentage INTEGER DEFAULT 40,
  is_published BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create questions table
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'true_false', 'numerical')),
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  marks INTEGER DEFAULT 4,
  negative_marks INTEGER DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create quiz_attempts table
CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  score INTEGER,
  percentage DECIMAL(5,2),
  passed BOOLEAN,
  answers JSONB DEFAULT '{}'::jsonb,
  time_taken_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Quizzes policies
CREATE POLICY "Admins manage quizzes"
  ON public.quizzes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students view published quizzes"
  ON public.quizzes FOR SELECT
  USING (is_published = true AND auth.role() = 'authenticated');

-- Questions policies
CREATE POLICY "Admins manage questions"
  ON public.questions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read questions"
  ON public.questions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Quiz attempts policies
CREATE POLICY "Admins view all attempts"
  ON public.quiz_attempts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own attempts"
  ON public.quiz_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own attempts"
  ON public.quiz_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own attempts"
  ON public.quiz_attempts FOR UPDATE
  USING (auth.uid() = user_id);
