/**
 * Supabase Helper Functions
 * Type-safe wrappers for common database operations
 * Includes timeout, retry, and abort logic for reliability
 */

import { supabase } from '../integrations/supabase/client';
import type { UserProfile, AppRole, Course, Lesson, Student, Enrollment } from '../types/supabase';
import type { Database, TablesInsert, TablesUpdate } from '../integrations/supabase/types';
import { logger } from "@/lib/logger";

type PublicTable = keyof Database['public']['Tables'];

// === TIMEOUT & RETRY CONSTANTS ===
const DEFAULT_TIMEOUT = 8000; // 8 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// === ERROR CLASSES ===
export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class SupabaseError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string = 'UNKNOWN', status: number = 500) {
    super(message);
    this.name = 'SupabaseError';
    this.code = code;
    this.status = status;
  }
}

// === TIMEOUT & RETRY HELPERS ===

/**
 * Wrap any promise with a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Sleep helper for retry delays
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    timeoutMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = MAX_RETRIES,
    retryDelay = RETRY_DELAY,
    timeoutMs = DEFAULT_TIMEOUT,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        onRetry?.(attempt, lastError);
        await sleep(retryDelay * attempt); // Exponential backoff
      }
    }
  }

  throw lastError;
}

/**
 * Safe Supabase query with timeout and retry
 */
export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  fallbackData: T,
  options: {
    timeoutMs?: number;
    maxRetries?: number;
  } = {}
): Promise<T> {
  try {
    const result = await withRetry(
      async () => {
        const { data, error } = await queryFn();
        if (error) throw error;
        return data;
      },
      { ...options }
    );
    return result ?? fallbackData;
  } catch (error) {
    console.warn("Query failed, using fallback:", error);
    return fallbackData;
  }
}

/**
 * Check if we're online
 */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

// === USER & PROFILE HELPERS ===

/**
 * Get the current authenticated user's session
 */
export async function getCurrentSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new SupabaseError(error.message, error.code || 'AUTH_ERROR', 401);
  return session;
}

/**
 * Get the current authenticated user
 */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new SupabaseError(error.message, error.code || 'AUTH_ERROR', 401);
  return user;
}

/**
 * Fetch a user's profile by their UID
 */
export async function getProfile(uid: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new SupabaseError(error.message, error.code, 500);
  }

  return data as UserProfile;
}

/**
 * Get the role for a specific user ID using the database function
 */
export async function getUserRole(uid: string): Promise<AppRole | null> {
  const { data, error } = await supabase
    .rpc('get_user_role', { _user_id: uid });

  if (error) {
    logger.error('Error fetching user role:', error);
    return null;
  }

  return data as AppRole | null;
}

/**
 * Check if a user has a specific role
 */
export async function hasRole(uid: string, role: AppRole): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('has_role', { _user_id: uid, _role: role });

  if (error) {
    logger.error('Error checking role:', error);
    return false;
  }

  return data === true;
}

// === AUTHORIZATION HELPERS ===

/**
 * Require admin role or throw 403 error
 */
export async function requireAdmin(uid?: string): Promise<void> {
  const userId = uid || (await getCurrentUser())?.id;
  
  if (!userId) {
    throw new SupabaseError('Authentication required', 'UNAUTHORIZED', 401);
  }

  const isAdmin = await hasRole(userId, 'admin');
  
  if (!isAdmin) {
    throw new SupabaseError('Admin access required', 'FORBIDDEN', 403);
  }
}

/**
 * Require teacher or admin role
 */
export async function requireTeacherOrAdmin(uid?: string): Promise<void> {
  const userId = uid || (await getCurrentUser())?.id;
  
  if (!userId) {
    throw new SupabaseError('Authentication required', 'UNAUTHORIZED', 401);
  }

  const isTeacher = await hasRole(userId, 'teacher');
  const isAdmin = await hasRole(userId, 'admin');
  
  if (!isTeacher && !isAdmin) {
    throw new SupabaseError('Teacher or Admin access required', 'FORBIDDEN', 403);
  }
}

/**
 * Require authenticated user
 */
export async function requireAuth(): Promise<string> {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new SupabaseError('Authentication required', 'UNAUTHORIZED', 401);
  }

  return user.id;
}

// === SECURE DATABASE HELPERS ===

/**
 * Type-safe insert with proper error handling.
 * Generic <T> is a public-schema table name; payload is inferred from Database types.
 */
export async function insertSecure<T extends PublicTable>(
  table: T,
  payload: TablesInsert<T> | TablesInsert<T>[]
): Promise<{ data: unknown[] | null; error: SupabaseError | null }> {
  try {
    const { data, error } = await supabase
      .from(table)
      // Supabase overload picks Insert vs Insert[]; the generic union widens
      // beyond both — narrow with a single Insert cast, not `any`.
      .insert(payload as never)
      .select();

    if (error) {
      if (error.code === '23505') {
        return { data: null, error: new SupabaseError('Duplicate entry', 'DUPLICATE', 409) };
      }
      if (error.code === '42501') {
        return { data: null, error: new SupabaseError('Permission denied', 'RLS_VIOLATION', 403) };
      }
      return { data: null, error: new SupabaseError(error.message, error.code, 500) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: new SupabaseError((err as Error).message, 'UNKNOWN', 500) };
  }
}

/**
 * Type-safe update with proper error handling
 */
export async function updateSecure<T extends PublicTable>(
  table: T,
  payload: TablesUpdate<T>,
  filter: { column: string; value: unknown }
): Promise<{ data: unknown[] | null; error: SupabaseError | null }> {
  try {
    const { data, error } = await supabase
      .from(table)
      .update(payload as never)
      .eq(filter.column as never, filter.value as never)
      .select();

    if (error) {
      if (error.code === '42501') {
        return { data: null, error: new SupabaseError('Permission denied', 'RLS_VIOLATION', 403) };
      }
      return { data: null, error: new SupabaseError(error.message, error.code, 500) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: new SupabaseError((err as Error).message, 'UNKNOWN', 500) };
  }
}

/**
 * Type-safe delete with proper error handling
 */
export async function deleteSecure<T extends PublicTable>(
  table: T,
  filter: { column: string; value: unknown }
): Promise<{ error: SupabaseError | null }> {
  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq(filter.column as never, filter.value as never);

    if (error) {
      if (error.code === '42501') {
        return { error: new SupabaseError('Permission denied', 'RLS_VIOLATION', 403) };
      }
      return { error: new SupabaseError(error.message, error.code, 500) };
    }

    return { error: null };
  } catch (err) {
    return { error: new SupabaseError((err as Error).message, 'UNKNOWN', 500) };
  }
}


// === COURSE HELPERS ===

/**
 * Get all courses
 */
export async function getAllCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new SupabaseError(error.message, error.code, 500);
  return data as Course[];
}

/**
 * Get a single course by ID
 */
export async function getCourseById(id: number): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new SupabaseError(error.message, error.code, 500);
  }

  return data as Course;
}

// === LESSON HELPERS ===

/**
 * Get lessons for a course
 */
export async function getLessonsByCourse(courseId: number): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true });

  if (error) throw new SupabaseError(error.message, error.code, 500);
  return data as Lesson[];
}

// === ENROLLMENT HELPERS ===

/**
 * Check if a user is enrolled in a course
 */
export async function isEnrolled(userId: string, courseId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'active')
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Enrollment check error:', error);
  }

  return !!data;
}

/**
 * Get user's active enrollments with course data
 */
export async function getUserEnrollments(userId: string) {
  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      *,
      courses (*)
    `)
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw new SupabaseError(error.message, error.code, 500);
  return data as unknown as Enrollment[];
}

// === STUDENT HELPERS ===

/**
 * Get students by grade and section
 */
export async function getStudentsByClass(grade: number, section: string): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('grade', grade)
    .order('name', { ascending: true });

  if (error) throw new SupabaseError(error.message, error.code, 500);
  return data as unknown as Student[];
}
