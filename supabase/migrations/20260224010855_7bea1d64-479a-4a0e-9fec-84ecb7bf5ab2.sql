-- Add parent_id column for sub-chapter (subfolder) support
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES chapters(id) ON DELETE SET NULL DEFAULT NULL;

-- Create index for efficient parent_id lookups
CREATE INDEX IF NOT EXISTS idx_chapters_parent_id ON chapters(parent_id);

-- Create lecture_schedules table for admin schedule management
CREATE TABLE IF NOT EXISTS lecture_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  meeting_link TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on lecture_schedules
ALTER TABLE lecture_schedules ENABLE ROW LEVEL SECURITY;

-- Admins and teachers can manage schedules
CREATE POLICY "Admins and teachers can manage schedules"
ON lecture_schedules
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher'));

-- Authenticated users can view schedules
CREATE POLICY "Authenticated users can view schedules"
ON lecture_schedules
FOR SELECT
USING (auth.role() = 'authenticated');