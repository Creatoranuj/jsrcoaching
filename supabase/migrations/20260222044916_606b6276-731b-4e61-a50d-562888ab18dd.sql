
-- =============================================
-- Phase 2: Database Schema & RLS Hardening
-- =============================================

-- 2c. Add Missing Triggers for auto-creating profile and role on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE TRIGGER on_auth_user_role_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 2b. Fix RLS Policies - Switch RESTRICTIVE to PERMISSIVE where needed

-- COURSES: Drop duplicate restrictive SELECT policies and recreate as permissive
DROP POLICY IF EXISTS "Anyone can view courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can view courses" ON public.courses;
DROP POLICY IF EXISTS "Admins can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Admins can delete courses" ON public.courses;
DROP POLICY IF EXISTS "Admins can update courses" ON public.courses;

CREATE POLICY "Anyone can view courses" ON public.courses
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage courses" ON public.courses
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- CHAPTERS: Fix restrictive policies
DROP POLICY IF EXISTS "Anyone can view chapters" ON public.chapters;
DROP POLICY IF EXISTS "Admins and teachers can manage chapters" ON public.chapters;

CREATE POLICY "Anyone can view chapters" ON public.chapters
  FOR SELECT USING (true);

CREATE POLICY "Admins and teachers can manage chapters" ON public.chapters
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- LESSONS: Fix restrictive policies  
DROP POLICY IF EXISTS "Authenticated users can view lessons" ON public.lessons;
DROP POLICY IF EXISTS "Admins and teachers can manage lessons" ON public.lessons;
DROP POLICY IF EXISTS "Only admins and teachers can insert lessons" ON public.lessons;

CREATE POLICY "Authenticated users can view lessons" ON public.lessons
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage lessons" ON public.lessons
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- MATERIALS: Fix restrictive policies
DROP POLICY IF EXISTS "Authenticated users can view materials" ON public.materials;
DROP POLICY IF EXISTS "Admins and teachers can manage materials" ON public.materials;

CREATE POLICY "Authenticated users can view materials" ON public.materials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage materials" ON public.materials
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- ENROLLMENTS: Fix restrictive policies
DROP POLICY IF EXISTS "Users can view own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Users can view their own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Users can insert own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Admins can manage enrollments" ON public.enrollments;

CREATE POLICY "Users can view own enrollments" ON public.enrollments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own enrollments" ON public.enrollments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage enrollments" ON public.enrollments
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- USER_PROGRESS: Fix restrictive policies
DROP POLICY IF EXISTS "Users can view own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Admins can view all progress" ON public.user_progress;

CREATE POLICY "Users can view own progress" ON public.user_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress" ON public.user_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress" ON public.user_progress
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all progress" ON public.user_progress
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- PROFILES: Fix restrictive policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES: Fix restrictive policies
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ATTENDANCE: Fix restrictive policies
DROP POLICY IF EXISTS "Authenticated users can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins and teachers can manage attendance" ON public.attendance;

CREATE POLICY "Authenticated users can view attendance" ON public.attendance
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage attendance" ON public.attendance
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- COMMENTS: Fix restrictive policies
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
DROP POLICY IF EXISTS "Users can update their comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete their comments" ON public.comments;

CREATE POLICY "Authenticated users can view comments" ON public.comments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create comments" ON public.comments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their comments" ON public.comments
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete their comments" ON public.comments
  FOR DELETE USING (auth.role() = 'authenticated');

-- MESSAGES: Fix restrictive policies
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their sent messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;

CREATE POLICY "Users can view their own messages" ON public.messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update their sent messages" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can delete their own messages" ON public.messages
  FOR DELETE USING (auth.uid() = sender_id);

-- NOTES: Fix restrictive policies
DROP POLICY IF EXISTS "Authenticated users can view notes" ON public.notes;
DROP POLICY IF EXISTS "Admins and teachers can manage notes" ON public.notes;

CREATE POLICY "Authenticated users can view notes" ON public.notes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage notes" ON public.notes
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- NOTICES: Fix restrictive policies
DROP POLICY IF EXISTS "Everyone can view notices" ON public.notices;
DROP POLICY IF EXISTS "Admins and teachers can manage notices" ON public.notices;

CREATE POLICY "Everyone can view notices" ON public.notices
  FOR SELECT USING (target_role IS NULL OR target_role = public.get_user_role(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins and teachers can manage notices" ON public.notices
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- PAYMENT_REQUESTS: Fix restrictive policies
DROP POLICY IF EXISTS "Users can view own payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Allow users to create requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Admins can manage all payment requests" ON public.payment_requests;

CREATE POLICY "Users can view own payment requests" ON public.payment_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Allow users to create requests" ON public.payment_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all payment requests" ON public.payment_requests
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- BOOKS: Fix restrictive policies
DROP POLICY IF EXISTS "Anyone can view books" ON public.books;
DROP POLICY IF EXISTS "Admins can insert books" ON public.books;
DROP POLICY IF EXISTS "Admins can update books" ON public.books;
DROP POLICY IF EXISTS "Admins can delete books" ON public.books;

CREATE POLICY "Anyone can view books" ON public.books
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage books" ON public.books
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- LECTURE_NOTES: Fix restrictive policies
DROP POLICY IF EXISTS "Users can view their own notes" ON public.lecture_notes;
DROP POLICY IF EXISTS "Users can create their own notes" ON public.lecture_notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON public.lecture_notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON public.lecture_notes;

CREATE POLICY "Users can view their own notes" ON public.lecture_notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notes" ON public.lecture_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes" ON public.lecture_notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes" ON public.lecture_notes
  FOR DELETE USING (auth.uid() = user_id);

-- LANDING_CONTENT: Fix restrictive policies
DROP POLICY IF EXISTS "Public Read Content" ON public.landing_content;
DROP POLICY IF EXISTS "Admins can insert landing content" ON public.landing_content;
DROP POLICY IF EXISTS "Admins can update landing content" ON public.landing_content;
DROP POLICY IF EXISTS "Admins can delete landing content" ON public.landing_content;

CREATE POLICY "Public Read Content" ON public.landing_content
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage landing content" ON public.landing_content
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- LEADS: Fix restrictive policies
DROP POLICY IF EXISTS "Anyone can submit leads" ON public.leads;
DROP POLICY IF EXISTS "Only admins can view leads" ON public.leads;

CREATE POLICY "Anyone can submit leads" ON public.leads
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Only admins can view leads" ON public.leads
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- SITE_STATS: Fix restrictive policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.site_stats;

CREATE POLICY "Enable read access for all users" ON public.site_stats
  FOR SELECT USING (true);

-- STUDENTS: Fix restrictive policies
DROP POLICY IF EXISTS "Authenticated users can view students" ON public.students;
DROP POLICY IF EXISTS "Admins and teachers can manage students" ON public.students;

CREATE POLICY "Authenticated users can view students" ON public.students
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage students" ON public.students
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- SYLLABUS: Fix restrictive policies
DROP POLICY IF EXISTS "Authenticated users can view syllabus" ON public.syllabus;
DROP POLICY IF EXISTS "Admins and teachers can manage syllabus" ON public.syllabus;

CREATE POLICY "Authenticated users can view syllabus" ON public.syllabus
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins and teachers can manage syllabus" ON public.syllabus
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- TIMETABLE: Fix restrictive policies
DROP POLICY IF EXISTS "Everyone can view timetable" ON public.timetable;
DROP POLICY IF EXISTS "Admins and teachers can manage timetable" ON public.timetable;

CREATE POLICY "Everyone can view timetable" ON public.timetable
  FOR SELECT USING (true);

CREATE POLICY "Admins and teachers can manage timetable" ON public.timetable
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));

-- USERS table: Fix restrictive policies
DROP POLICY IF EXISTS "No direct access to users table" ON public.users;
DROP POLICY IF EXISTS "No direct delete to users table" ON public.users;
DROP POLICY IF EXISTS "No direct insert to users table" ON public.users;
DROP POLICY IF EXISTS "No direct update to users table" ON public.users;

CREATE POLICY "No direct access to users table" ON public.users
  FOR SELECT USING (false);

CREATE POLICY "No direct delete to users table" ON public.users
  FOR DELETE USING (false);

CREATE POLICY "No direct insert to users table" ON public.users
  FOR INSERT WITH CHECK (false);

CREATE POLICY "No direct update to users table" ON public.users
  FOR UPDATE USING (false);

-- STORAGE: Admin-only upload policies for course-videos and course-materials
CREATE POLICY "Admins can upload to course-videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'course-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view course-videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-videos');

CREATE POLICY "Admins can delete course-videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'course-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload to course-materials"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'course-materials' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view course-materials"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-materials');

CREATE POLICY "Admins can delete course-materials"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'course-materials' AND public.has_role(auth.uid(), 'admin'));
