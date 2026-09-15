/**
 * Canonical Type Definitions for Supabase Entities
 * All components/hooks should import types from this file
 */

import type { Database } from '../integrations/supabase/types';

// === ROLE TYPES ===
export type AppRole = 'admin' | 'teacher' | 'student';

// === USER & PROFILE TYPES ===
export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  avatar_url: string | null;
  role?: string | null;
  created_at: string | null;
}

export interface UserWithRole extends UserProfile {
  app_role: AppRole;
}

// === COURSE TYPES ===
export interface Course {
  id: number;
  title: string;
  description: string | null;
  grade: string | null;
  price: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  created_at: string | null;
}

// === LESSON TYPES ===
export interface Lesson {
  id: string;
  title: string;
  video_url: string;
  is_locked: boolean | null;
  description: string | null;
  course_id: number | null;
  created_at: string | null;
}

// === STUDENT TYPES ===
export interface Student {
  id: number;
  name: string;
  roll_number?: string;
  grade: string | number;
  section?: string;
  phone?: string;
  email?: string;
  user_id?: string;
  created_at: string;
}

// === ATTENDANCE TYPES ===
export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface AttendanceRecord {
  id: number;
  student_id: number;
  date: string;
  status: AttendanceStatus;
  created_at: string;
}

// === ENROLLMENT TYPES ===
export interface Enrollment {
  id: number;
  user_id: string;
  course_id: number;
  status: string | null;
  purchased_at: string | null;
}

export interface EnrollmentWithCourse extends Enrollment {
  courses: Course;
}

// === PAYMENT TYPES ===
export interface PaymentRequest {
  id: number;
  user_id: string | null;
  course_id: number | null;
  transaction_id: string | null;
  amount: number | null;
  status: string | null;
  screenshot_url: string | null;
  sender_name: string | null;
  user_name: string | null;
  created_at: string | null;
}

// === MATERIAL TYPES ===
export interface Material {
  id: string;
  title: string;
  file_url: string;
  file_type?: string;
  type?: string;
  file_size?: number | null;
  description: string | null;
  course_id: number | null;
  lesson_id?: string | null;
  uploaded_by?: string | null;
  created_at: string;
}

// === MESSAGE TYPES ===
export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  subject: string;
  content: string;
  is_read: boolean | null;
  created_at: string;
}

// === NOTICE TYPES ===
export interface Notice {
  id: string;
  title: string;
  content: string;
  author_id: string | null;
  target_role: AppRole | null;
  is_pinned: boolean | null;
  expires_at: string | null;
  created_at: string;
}

// === SYLLABUS TYPES ===
export interface Syllabus {
  id: string;
  course_id: number;
  title: string;
  description: string | null;
  topics: string[] | null;
  week_number: number | null;
  created_at: string;
}

// === TIMETABLE TYPES ===
export interface TimetableEntry {
  id: string;
  course_id: number | null;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  created_at: string;
}

// === LEAD TYPES ===
export interface Lead {
  id: number;
  studentName: string;
  email: string;
  grade: string;
  created_at: string | null;
}

// === HERO/LANDING DATA ===
export interface HeroData {
  title?: string;
  subtitle?: string;
  cta_text?: string;
  cta_link?: string;
  image_url?: string;
}

export interface LandingContent {
  section_key: string;
  content: Record<string, unknown> | null;
}

// === COMMENT TYPES ===
export interface Comment {
  id: string;
  lesson_id: string | null;
  user_name: string;
  message: string;
  created_at: string | null;
}

// === NOTE TYPES ===
export interface Note {
  id: string;
  lesson_id: string | null;
  title: string;
  pdf_url: string;
  created_at: string | null;
}

// === SITE STATS ===
export interface SiteStat {
  id: number;
  stat_key: string;
  stat_value: string;
}

// === DATABASE ROW TYPE EXPORTS ===
export type DbProfile = Database['public']['Tables']['profiles']['Row'];
export type DbCourse = Database['public']['Tables']['courses']['Row'];
export type DbLesson = Database['public']['Tables']['lessons']['Row'];
export type DbStudent = Database['public']['Tables']['students']['Row'];
export type DbEnrollment = Database['public']['Tables']['enrollments']['Row'];
export type DbPaymentRequest = Database['public']['Tables']['payment_requests']['Row'];
export type DbMaterial = Database['public']['Tables']['materials']['Row'];
export type DbMessage = Database['public']['Tables']['messages']['Row'];
export type DbNotice = Database['public']['Tables']['notices']['Row'];
export type DbAttendance = Database['public']['Tables']['attendance']['Row'];
