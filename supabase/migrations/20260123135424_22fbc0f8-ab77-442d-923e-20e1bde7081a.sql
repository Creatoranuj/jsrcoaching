-- ============================================
-- EDUCATION PLATFORM DATABASE SCHEMA
-- ============================================

-- 1. Create app_role enum for role-based access
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create user_roles table (CRITICAL for security - roles separate from profiles)
CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'student',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, role)
);

-- 3. Create messages table for internal messaging
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    subject text NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create timetable table for schedules
CREATE TABLE IF NOT EXISTS public.timetable (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id bigint REFERENCES public.courses(id) ON DELETE CASCADE,
    day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time time NOT NULL,
    end_time time NOT NULL,
    room text,
    teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create notices table for announcements
CREATE TABLE IF NOT EXISTS public.notices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    content text NOT NULL,
    author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    is_pinned boolean DEFAULT false,
    target_role app_role,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create materials table for study materials
CREATE TABLE IF NOT EXISTS public.materials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id bigint REFERENCES public.courses(id) ON DELETE CASCADE,
    lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    file_url text NOT NULL,
    file_type text NOT NULL,
    file_size bigint,
    uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Create syllabus table
CREATE TABLE IF NOT EXISTS public.syllabus (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id bigint REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    title text NOT NULL,
    description text,
    week_number integer,
    topics text[],
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECURITY DEFINER FUNCTION FOR ROLE CHECKS
-- ============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Helper function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- ============================================
-- RLS POLICIES FOR user_roles
-- ============================================

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- RLS POLICIES FOR messages
-- ============================================

CREATE POLICY "Users can view their own messages"
ON public.messages FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can send messages"
ON public.messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update their sent messages"
ON public.messages FOR UPDATE
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can delete their own messages"
ON public.messages FOR DELETE
USING (auth.uid() = sender_id);

-- ============================================
-- RLS POLICIES FOR timetable
-- ============================================

CREATE POLICY "Everyone can view timetable"
ON public.timetable FOR SELECT
USING (true);

CREATE POLICY "Admins and teachers can manage timetable"
ON public.timetable FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- ============================================
-- RLS POLICIES FOR notices
-- ============================================

CREATE POLICY "Everyone can view notices"
ON public.notices FOR SELECT
USING (
  target_role IS NULL 
  OR target_role = public.get_user_role(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins and teachers can manage notices"
ON public.notices FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- ============================================
-- RLS POLICIES FOR materials
-- ============================================

CREATE POLICY "Authenticated users can view materials"
ON public.materials FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage materials"
ON public.materials FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- ============================================
-- RLS POLICIES FOR syllabus
-- ============================================

CREATE POLICY "Authenticated users can view syllabus"
ON public.syllabus FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage syllabus"
ON public.syllabus FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- ============================================
-- RLS POLICIES FOR lessons
-- ============================================

CREATE POLICY "Authenticated users can view lessons"
ON public.lessons FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage lessons"
ON public.lessons FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- ============================================
-- RLS POLICIES FOR notes
-- ============================================

CREATE POLICY "Authenticated users can view notes"
ON public.notes FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage notes"
ON public.notes FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- ============================================
-- RLS POLICIES FOR comments
-- ============================================

CREATE POLICY "Authenticated users can view comments"
ON public.comments FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create comments"
ON public.comments FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- RLS POLICIES FOR students
-- ============================================

CREATE POLICY "Authenticated users can view students"
ON public.students FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage students"
ON public.students FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- ============================================
-- STORAGE BUCKETS FOR UPLOADS
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-videos', 'course-videos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-materials', 'course-materials', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for course-videos
CREATE POLICY "Public can view course videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-videos');

CREATE POLICY "Admins and teachers can upload course videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course-videos' 
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

CREATE POLICY "Admins and teachers can update course videos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'course-videos' 
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

CREATE POLICY "Admins and teachers can delete course videos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course-videos' 
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

-- Storage policies for course-materials
CREATE POLICY "Public can view course materials"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-materials');

CREATE POLICY "Admins and teachers can upload course materials"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course-materials' 
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

CREATE POLICY "Admins and teachers can update course materials"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'course-materials' 
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

CREATE POLICY "Admins and teachers can delete course materials"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course-materials' 
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);

-- ============================================
-- TRIGGER TO AUTO-CREATE USER ROLE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();