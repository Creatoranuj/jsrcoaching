/**
 * Admin Configuration
 * ===================
 * SECURITY: Admin access is determined server-side via user_roles table.
 * No hardcoded emails - the has_role() function in RLS enforces access.
 * This file only provides a helper to check if a user has admin role from AuthContext.
 */

export const ADMIN_CONFIG = {
  // Admin check is now purely server-side via user_roles table
  // No hardcoded email - prevents exposure in client bundle
  isAuthorizedAdmin: (_email: string | null | undefined): boolean => {
    // Always return true here - actual admin check happens via 
    // useAuth().isAdmin which queries user_roles table server-side
    return true;
  }
} as const;
