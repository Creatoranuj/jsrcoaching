import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { reportError } from "@/lib/sentry";
import { useNavigate, useSearchParams } from "react-router-dom";
import { openResource } from "@/lib/openResource";
import { supabase } from "../integrations/supabase/client";
// detectFileType / fileTypeOptions / MaterialFileType moved into LibraryManager
// where they are now the only consumers. Removed from Admin.tsx to drop dead
// imports after the library tab extraction.
import {
  unifyPayments, filterPayments, filterCourses, filterUsers,
  activeTeachers as listActiveTeachers, promotableStudents as listPromotableStudents,
  buildCsv, csvFileName,
} from "@/features/admin/lib/adminFilters";
import type { AdminUser, ManualPaymentRow, RazorpayPaymentRow, UnifiedPayment } from "@/features/admin/lib/adminFilters";
import { paymentTotals } from "@/features/admin/lib/adminStats";
import { AdminUsersTab } from "@/features/admin/components/AdminUsersTab";
import { AdminSessionsTab } from "@/features/admin/components/AdminSessionsTab";
import type { AdminSession } from "@/features/admin/components/AdminSessionsTab";
import type { Tables } from "@/integrations/supabase/types";
import { AdminOverviewTab } from "@/features/admin/components/AdminOverviewTab";
import { AdminStatsGrid } from "@/features/admin/components/AdminStatsGrid";
import { AdminPaymentsTab } from "@/features/admin/components/AdminPaymentsTab";
import { AdminTeachersTab } from "@/features/admin/components/AdminTeachersTab";
import { AdminCoursesTab } from "@/features/admin/components/AdminCoursesTab";
import { AdminRefundDialog } from "@/features/admin/components/AdminRefundDialog";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import { Textarea } from "../components/ui/textarea";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errorMessage";
import {
  Upload, Users, CheckCircle, XCircle, Clock,
  Trash2, Plus, BookOpen, ExternalLink, ShieldAlert, Search,
  Download, Filter, RefreshCw, Eye, IndianRupee, Loader2, Library, Calendar,
  GraduationCap, UserCheck, UserX, Radio, ImageIcon, MessageSquare, Monitor, MonitorPlay, SlidersHorizontal, Smartphone, LogOut,
  FileText, Link as LinkIcon, LayoutDashboard,
} from "lucide-react";

// Admin tab panels are route-heavy leaves that only one operator tab shows at a
// time. Loading them lazily keeps the /admin entry chunk small; lazyWithRetry
// survives stale chunk hashes after a deploy. Each panel already mounts only
// when its tab is active, so the extra chunk fetch happens on the tab click.
const ContentDrillDown = lazyWithRetry(() => import("../components/admin/ContentDrillDown"));
const SocialLinksManager = lazyWithRetry(() => import("../components/admin/SocialLinksManager"));
const PlayerReaderControlsManager = lazyWithRetry(() => import("../components/admin/PlayerReaderControls"));
const LessonFeatureControlsManager = lazyWithRetry(() => import("../components/admin/LessonFeatureControls"));
const MenuFeatureControlsManager = lazyWithRetry(() => import("../components/admin/MenuFeatureControls"));
const HeroBannerManager = lazyWithRetry(() => import("../components/admin/HeroBannerManager"));
const LandingCoursesManager = lazyWithRetry(() => import("../components/admin/LandingCoursesManager"));
const TestimonialsManager = lazyWithRetry(() => import("../components/admin/TestimonialsManager"));
const SyllabusManager = lazyWithRetry(() => import("../components/admin/SyllabusManager"));
const TimetableManager = lazyWithRetry(() => import("../components/admin/TimetableManager"));
const EnrollmentManager = lazyWithRetry(() => import("../components/admin/EnrollmentManager"));
const LibraryManager = lazyWithRetry(() => import("../components/admin/LibraryManager"));

// One shared fallback for every lazy panel: matches the card rhythm of the
// tabs so switching tabs doesn't jump the layout.
const PanelFallback = () => (
  <div className="flex items-center justify-center py-16 text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
  </div>
);

// Shape shared with the extracted admin helpers/components.
type UserWithRole = AdminUser;

// EnrollmentManager extracted to src/components/admin/EnrollmentManager.tsx
// (memoized, lazy-mountable, easier to test).


const Admin = () => {
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const activeTab = searchParams.get("tab") || "overview";
  const setActiveTab = (tab: string) => setSearchParams({ tab }, { replace: true });

  // Auto-center the active tab inside the horizontally scrolling TabsList so
  // its label is never clipped at the edges.
  // PERF/UX — do NOT use `scrollIntoView` here: it scrolls every ancestor
  // scroller (including <main> and the document), which yanks the whole admin
  // page. We scroll the chip container itself instead, with a single layout
  // read inside one rAF.
  const tabsScrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const scroller = tabsScrollerRef.current;
      const chip = scroller?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (!scroller || !chip) return;
      const target = chip.offsetLeft - (scroller.clientWidth - chip.offsetWidth) / 2;
      const max = scroller.scrollWidth - scroller.clientWidth;
      const left = Math.max(0, Math.min(target, max));
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      scroller.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTab]);


  // -- DATA STATES --
  const [payments, setPayments] = useState<ManualPaymentRow[]>([]);
  const [razorpayPayments, setRazorpayPayments] = useState<RazorpayPaymentRow[]>([]);
  const [coursesList, setCoursesList] = useState<Tables<"courses">[]>([]);
  const [usersList, setUsersList] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleChanging, setRoleChanging] = useState<Record<string, boolean>>({});
  const [statsData, setStatsData] = useState({
    totalStudents: 0,
    totalCourses: 0,
    pendingPayments: 0,
    activeEnrollments: 0,
    totalRevenue: 0,
    activeSessions: 0,
  });

  // -- SESSIONS STATE --
  const [sessionsList, setSessionsList] = useState<AdminSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [terminatingSession, setTerminatingSession] = useState<string | null>(null);

  // -- SEARCH & FILTER STATES --
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"pending" | "approved" | "rejected" | "completed" | "refunded" | "all">("all");
  const [refundingPayment, setRefundingPayment] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  // Batch Full controls: active enrollments per course + the row being saved.
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<number, number>>({});
  const [savingCourseId, setSavingCourseId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "student" | "teacher" | "admin">("all");
  const [teacherSearch, setTeacherSearch] = useState("");

  // -- COURSE CREATION STATE --
  const [newCourse, setNewCourse] = useState({ title: "", description: "", price: "", grade: "", startDate: "", endDate: "" });
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [courseThumbnailUrl, setCourseThumbnailUrl] = useState("");
  const [courseThumbnailMode, setCourseThumbnailMode] = useState<"file" | "url">("file");

  // -- INLINE EDIT: Course --
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);
  const [editCourseData, setEditCourseData] = useState({ title: "", description: "", price: "", grade: "", startDate: "", endDate: "" });
  const [editThumbnailFile, setEditThumbnailFile] = useState<File | null>(null);
  const [editThumbnailUrl, setEditThumbnailUrl] = useState("");
  const [editThumbnailMode, setEditThumbnailMode] = useState<"file" | "url">("file");

  // -- LIBRARY STATE moved into <LibraryManager /> (src/components/admin/LibraryManager.tsx).
  // It owns its 13 local state slices + 7 handlers + fetchLibraryData side-effect.
  // Admin only passes `coursesList` so the memoized child won't re-render on tab switches.

  // Admin access protection
  useEffect(() => {
    if (!authLoading && !user) {
      toast.error("Please login to access admin panel");
      navigate("/admin/login");
    } else if (!authLoading && user && !isAdmin) {
      toast.error("Access denied. Admin privileges required.");
      navigate("/dashboard");
    }
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (user && isAdmin) fetchDashboardData();
  }, [user, isAdmin]);

  // --- FETCH DATA ---
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: coursesData } = await supabase.from('courses').select('*');
      if (coursesData) setCoursesList(coursesData);

      // Active enrollments per course — powers the "x / y enrolled" counter
      // next to the Batch Full switch.
      const { data: enrollmentRows } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('status', 'active');
      if (enrollmentRows) {
        const counts: Record<number, number> = {};
        for (const row of enrollmentRows) {
          const cid = Number(row.course_id);
          counts[cid] = (counts[cid] || 0) + 1;
        }
        setEnrollmentCounts(counts);
      }

      const { data: profilesData } = await supabase.from('profiles').select('*');
      const profileMap = new Map<string, Tables<"profiles">>((profilesData || []).map((p) => [p.id, p]));
      const withProfile = <T extends { user_id: string }>(rows: T[] | null) =>
        (rows || []).map((r) => ({ ...r, profiles: profileMap.get(r.user_id) ?? null }));

      // profiles is not FK-linked to payment tables — join client-side.
      const { data: payData } = await supabase
        .from('payment_requests')
        .select(`*, courses (title)`)
        .order('created_at', { ascending: false });
      setPayments(withProfile(payData));

      const { data: rzpData } = await supabase
        .from('razorpay_payments')
        .select(`*, courses (title)`)
        .order('created_at', { ascending: false });
      setRazorpayPayments(withProfile(rzpData));

      const { data: rolesData } = await supabase.from('user_roles').select('user_id, role');
      if (profilesData) {
        const usersWithRoles: UserWithRole[] = profilesData.map(profile => ({
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          mobile: profile.mobile,
          created_at: profile.created_at,
          role: rolesData?.find(r => r.user_id === profile.id)?.role || null
        }));
        setUsersList(usersWithRoles);
      }

      const { count: studentCount } = await supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'student');
      const { count: enrollCount } = await supabase.from('enrollments').select('*', { count: 'exact', head: true });
      const { count: pendingCount } = await supabase.from('payment_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');

      // Supabase status values may be capitalised (e.g. 'Approved', 'Completed')
      // depending on how the row was inserted, so match case-insensitively.
      const { data: approvedPayments } = await supabase.from('payment_requests').select('amount').ilike('status', 'approved');
      const { data: completedRzp } = await supabase.from('razorpay_payments').select('amount').ilike('status', 'completed');
      const manualRevenue = approvedPayments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const rzpRevenue = completedRzp?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      // LibraryManager fetches its own data on mount; no eager fetch needed here.

      const { count: sessionsCount } = await supabase
        .from("user_sessions")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      setStatsData({
        totalStudents: studentCount || 0,
        totalCourses: coursesData?.length || 0,
        pendingPayments: pendingCount || 0,
        activeEnrollments: enrollCount || 0,
        totalRevenue: manualRevenue + rzpRevenue,
        activeSessions: sessionsCount || 0,
      });
    } catch (error) {
      reportError(error, { surface: "Admin.fetch" });
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  // --- ROLE MANAGEMENT ---
  const handleChangeRole = async (userId: string, newRole: string) => {
    // AUTHZ: promoting to admin is a privileged, silent-by-default action —
    // require an explicit confirm like every other high-impact admin action.
    if (newRole === "admin" && !(await confirmAction({
      title: "Grant admin access to this user?",
      description: "They will gain full access to payments, users, and content.",
      variant: "destructive",
    }))) return;
    setRoleChanging(prev => ({ ...prev, [userId]: true }));
    try {
      const { error: delError } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (delError) throw delError;
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole as "admin" | "teacher" | "student" });
      if (error) throw error;
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast.success("Role updated successfully");
    } catch (err: unknown) {
      toast.error("Failed to update role: " + (getErrorMessage(err) || "Unknown error"));
    } finally {
      setRoleChanging(prev => ({ ...prev, [userId]: false }));
    }
  };

  // --- FILTERED DATA ---
  const allPaymentsUnified = useMemo(
    () => unifyPayments(payments, razorpayPayments),
    [payments, razorpayPayments],
  );

  const filteredPayments = useMemo(
    () => filterPayments(allPaymentsUnified, paymentSearch, paymentStatusFilter),
    [allPaymentsUnified, paymentSearch, paymentStatusFilter],
  );

  const filteredCourses = useMemo(
    () => filterCourses(coursesList, courseSearch),
    [coursesList, courseSearch],
  );

  const filteredUsers = useMemo(
    () => filterUsers(usersList, userSearch, userRoleFilter),
    [usersList, userSearch, userRoleFilter],
  );

  const activeTeachers = useMemo(() => listActiveTeachers(usersList), [usersList]);
  const promotableStudents = useMemo(
    () => listPromotableStudents(usersList, teacherSearch),
    [usersList, teacherSearch],
  );

  // Payment revenue maths lives in src/features/admin/lib/adminStats.ts so the
  // rules stay unit-testable; the tab just renders the result.
  const paymentSummary = useMemo(
    () => paymentTotals(payments, razorpayPayments),
    [payments, razorpayPayments],
  );

  // Receipt screenshots are private: sign a short-lived URL before opening.
  const handleViewScreenshot = async (screenshotPath: string) => {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(screenshotPath, 3600);
    if (data?.signedUrl) await openResource({ url: data.signedUrl, kind: "image" });
    else if (error) toast.error('Could not load screenshot');
  };

  // --- EXPORT ---
  const exportToCSV = (data: Array<Record<string, unknown>>, filename: string) => {
    const csvContent = buildCsv(data);
    if (!csvContent) { toast.error("No data to export"); return; }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const href = URL.createObjectURL(blob);
    link.href = href;
    link.download = csvFileName(filename);
    link.click();
    // Blob URLs pin their Blob in memory until revoked. Every export used to
    // leak one for the lifetime of the session; on a long admin session with
    // repeated exports that is real heap the WebView never gets back.
    setTimeout(() => URL.revokeObjectURL(href), 0);
    toast.success(`Exported ${data.length} records`);
  };

  // --- PAYMENT ACTIONS ---
  // SECURITY: Verify amount >= course price client-side (DB trigger is the
  // real enforcer — this just gives the admin a clear UX warning). Enroll
  // FIRST, then mark approved, so we never end up with status=approved but
  // no enrollment row if the second write fails. Idempotent.
  const handleApprovePayment = async (paymentRequest) => {
    if (paymentRequest.status === 'approved') {
      toast.info("Already approved.");
      return;
    }
    // Re-fetch course price at approval time (price could have changed).
    const { data: course, error: courseErr } = await supabase
      .from('courses').select('price, title').eq('id', paymentRequest.course_id).maybeSingle();
    if (courseErr || !course) {
      toast.error("Could not load course for verification.");
      return;
    }
    const expected = Number(course.price || 0);
    const claimed = Number(paymentRequest.amount || 0);
    if (expected === 0) {
      toast.error("This is a free course — manual payment should not be approved.");
      return;
    }
    if (claimed < expected) {
      toast.error(`Amount mismatch: paid ₹${claimed} but course costs ₹${expected}. Reject or ask user to repay.`);
      return;
    }
    const confirmMsg = claimed > expected
      ? `Approve ₹${claimed} for "${course.title}" (₹${expected})? User overpaid by ₹${claimed - expected}.`
      : `Approve payment of ₹${claimed} for "${course.title}" by ${paymentRequest.sender_name}?`;
    if (!(await confirmAction({ title: confirmMsg, variant: "destructive" }))) return;

    try {
      // 1. Enroll first (idempotent via onConflict).
      const { error: enrollError } = await supabase.from('enrollments')
        .upsert(
          { user_id: paymentRequest.user_id, course_id: paymentRequest.course_id, status: 'active' },
          { onConflict: 'user_id,course_id', ignoreDuplicates: true }
        );
      if (enrollError) throw enrollError;

      // 2. Then mark request approved (trigger stamps approved_by/approved_at).
      const { error: updateError } = await supabase
        .from('payment_requests')
        .update({ status: 'approved' })
        .eq('id', paymentRequest.id)
        .eq('status', 'pending'); // optimistic-concurrency: only if still pending
      if (updateError) throw updateError;

      toast.success("Payment Approved & Course Unlocked!");
      fetchDashboardData();
    } catch (error: unknown) {
      toast.error("Approval Error: " + getErrorMessage(error));
    }
  };

  const handleRejectPayment = async (paymentId: number) => {
    if (!(await confirmAction({ title: "Are you sure you want to REJECT this payment?", variant: "destructive" }))) return;
    try {
      const { error } = await supabase
        .from('payment_requests')
        .update({ status: 'rejected' })
        .eq('id', paymentId)
        .eq('status', 'pending'); // don't overwrite already-actioned rows
      if (error) throw error;
      toast.error("Payment request rejected.");
      fetchDashboardData();
    } catch (error: unknown) {
      toast.error("Error rejecting: " + getErrorMessage(error));
    }
  };

  // --- REFUND CONFIRMATION DIALOG STATE ---
  const [refundConfirmPayment, setRefundConfirmPayment] = useState<UnifiedPayment | null>(null);
  const [refundConfirmText, setRefundConfirmText] = useState("");
  // Blank = full refund (historical behaviour). Rupees, converted to paise.
  const [refundAmountText, setRefundAmountText] = useState("");

  const openRefundDialog = (payment) => {
    setRefundConfirmPayment(payment);
    setRefundConfirmText("");
    setRefundAmountText("");
  };

  const closeRefundDialog = () => {
    setRefundConfirmPayment(null);
    setRefundConfirmText("");
    setRefundAmountText("");
  };

  const handleInitiateRefund = async () => {
    const payment = refundConfirmPayment;
    if (!payment) return;
    const trimmed = refundAmountText.trim();
    const rupees = trimmed === "" ? null : Number(trimmed);
    if (rupees !== null && (!Number.isFinite(rupees) || rupees <= 0)) {
      toast.error("Enter a valid refund amount, or leave it blank for a full refund.");
      return;
    }
    setRefundConfirmPayment(null);
    setRefundConfirmText("");
    setRefundAmountText("");
    setRefundingPayment(payment._key);
    try {
      // supabase.functions.invoke — works in native APK without the dev proxy.
      const { data, error } = await supabase.functions.invoke("initiate-refund", {
        body: {
          razorpay_payment_id: payment.razorpay_payment_id,
          razorpay_order_id: payment.razorpay_order_id,
          ...(rupees === null ? {} : { amount: Math.round(rupees * 100) }),
        },
      });
      if (error) throw new Error(error.message || "Refund failed");
      if (!data?.success) throw new Error(data?.error || 'Refund failed');
      toast.success(
        data?.is_full === false
          ? 'Partial refund initiated. Course access kept.'
          : 'Refund initiated! Course access revoked.'
      );
      fetchDashboardData();
    } catch (err: unknown) {
      toast.error('Refund failed: ' + (getErrorMessage(err) || 'Unknown error'));
    } finally {
      setRefundingPayment(null);
    }
  };


  const handleCreateCourse = async () => {
    if (!newCourse.title || !newCourse.price || !newCourse.grade) return toast.error("Fill all fields");
    try {
      setIsCreatingCourse(true);
      let thumbnailUrl = "https://placehold.co/600x400/png";
      if (courseThumbnailMode === "url" && courseThumbnailUrl.trim()) {
        thumbnailUrl = courseThumbnailUrl.trim();
      } else if (thumbnailFile) {
        const fileExt = thumbnailFile.name.split('.').pop();
        const fileName = `course_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('content').upload(`thumbnails/${fileName}`, thumbnailFile, {
          cacheControl: '31536000',
          contentType: thumbnailFile.type,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        thumbnailUrl = `storage://content/thumbnails/${fileName}`;

      }
      const { error } = await supabase.from('courses').insert({
        title: newCourse.title, description: newCourse.description, price: parseFloat(newCourse.price),
        grade: newCourse.grade, image_url: thumbnailUrl, thumbnail_url: thumbnailUrl,
        start_date: newCourse.startDate || null,
        end_date: newCourse.endDate || null,
      });
      if (error) throw error;
      toast.success("Course Created!");
      setNewCourse({ title: "", description: "", price: "", grade: "", startDate: "", endDate: "" });
      setThumbnailFile(null);
      setCourseThumbnailUrl("");
      setCourseThumbnailMode("file");
      fetchDashboardData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsCreatingCourse(false);
    }
  };

  /**
   * Batch Full switch. Turning enrollment off hides the Buy button across the
   * app; `complete_paid_enrollment()` also refuses new paid enrollments, so a
   * stale page or a direct /buy-course link cannot slip through. Students who
   * already bought the course are unaffected.
   */
  const handleToggleEnrollment = async (course: Tables<"courses">, open: boolean) => {
    setSavingCourseId(course.id);
    // Optimistic — the switch must feel instant; we revert on error.
    setCoursesList((prev) => prev.map((c) => (c.id === course.id ? { ...c, enrollment_open: open } : c)));
    const { error } = await supabase.from('courses').update({ enrollment_open: open }).eq('id', course.id);
    setSavingCourseId(null);
    if (error) {
      setCoursesList((prev) => prev.map((c) => (c.id === course.id ? { ...c, enrollment_open: !open } : c)));
      toast.error(getErrorMessage(error) || "Could not update enrollment");
      return;
    }
    toast.success(open ? `Enrollment open for "${course.title}"` : `"${course.title}" marked Batch Full`);
  };

  /** Optional hard seat cap. null = unlimited. */
  const handleSaveSeatLimit = async (course: Tables<"courses">, seatLimit: number | null) => {
    setSavingCourseId(course.id);
    const { error } = await supabase.from('courses').update({ seat_limit: seatLimit }).eq('id', course.id);
    setSavingCourseId(null);
    if (error) {
      toast.error(getErrorMessage(error) || "Could not save the seat limit");
      return;
    }
    setCoursesList((prev) => prev.map((c) => (c.id === course.id ? { ...c, seat_limit: seatLimit } : c)));
    toast.success(seatLimit == null ? "Seat limit removed" : `Seat limit set to ${seatLimit}`);
  };

  const handleDeleteCourse = async (id: number) => {
    if (!(await confirmAction({ title: "Delete course? This will remove all lessons too!", variant: "destructive" }))) return;
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success("Course deleted"); fetchDashboardData(); }
  };

  const handleEditCourse = (course) => {
    setEditingCourseId(course.id);
    setEditCourseData({ title: course.title || "", description: course.description || "", price: String(course.price || ""), grade: course.grade || "", startDate: course.start_date || "", endDate: course.end_date || "" });
    setEditThumbnailFile(null);
    setEditThumbnailUrl(course.thumbnail_url || course.image_url || "");
    setEditThumbnailMode("file");
  };

  const handleSaveCourseEdit = async () => {
    if (!editingCourseId) return;
    let thumbnailUrl: string | undefined;
    if (editThumbnailMode === "url") {
      thumbnailUrl = editThumbnailUrl.trim() || undefined;
    } else if (editThumbnailFile) {
      const fileExt = editThumbnailFile.name.split('.').pop();
      const fileName = `course_${editingCourseId}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('content').upload(`thumbnails/${fileName}`, editThumbnailFile, {
        cacheControl: '31536000',
        contentType: editThumbnailFile.type,
        upsert: false,
      });
      if (uploadError) { toast.error(uploadError.message); return; }
      thumbnailUrl = `storage://content/thumbnails/${fileName}`;

    }
    const updateData: Partial<Tables<"courses">> = { title: editCourseData.title, description: editCourseData.description, price: parseFloat(editCourseData.price) || 0, grade: editCourseData.grade, start_date: editCourseData.startDate || null, end_date: editCourseData.endDate || null };
    if (thumbnailUrl) { updateData.image_url = thumbnailUrl; updateData.thumbnail_url = thumbnailUrl; }
    const { error } = await supabase.from('courses').update(updateData).eq('id', editingCourseId);
    if (error) toast.error(error.message);
    else { toast.success("Course updated!"); setEditingCourseId(null); setEditThumbnailFile(null); setEditThumbnailUrl(""); setEditThumbnailMode("file"); fetchDashboardData(); }
  };

  // --- Library & Notes CRUD moved into <LibraryManager />.
  // fetchLibraryData / filteredLibraryLessons / handleCreateMaterial /
  // handleDeleteMaterial / handleSaveMaterialEdit / handleCreateNote /
  // handleDeleteNote / handleSaveNoteEdit all live there now. Admin keeps
  // a slimmer surface and `LibraryManager` can be `React.memo`-skipped on
  // every non-library tab switch.

  // --- Sessions ---
  const fetchSessionsData = async () => {
    setSessionsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("id, user_id, device_type, user_agent, last_active_at, logged_in_at, is_active")
        .eq("is_active", true).order("last_active_at", { ascending: false });
      if (!error && data) setSessionsList(data);
    } finally { setSessionsLoading(false); }
  };

  const handleForceLogout = async (sessionToken: string, targetUserId: string) => {
    if (!(await confirmAction({ title: "Force logout this session?", variant: "destructive" }))) return;
    setTerminatingSession(sessionToken);
    try {
      const { error } = await supabase.functions.invoke("manage-session", {
        body: { action: "terminate", session_id: sessionToken },
      });
      if (!error) {
        toast.success("Session terminated");
        setSessionsList(prev => prev.filter(s => s.id !== sessionToken));
        setStatsData(prev => ({ ...prev, activeSessions: Math.max(0, prev.activeSessions - 1) }));
      } else toast.error("Failed to terminate session");
    } finally { setTerminatingSession(null); }
  };

  // --- UI Helpers ---
  const stats = [
    { label: "Total Students", value: statsData.totalStudents, icon: Users, color: "text-blue-600 bg-blue-100", tab: "users" },
    { label: "Total Revenue", value: `₹${statsData.totalRevenue.toLocaleString()}`, icon: IndianRupee, color: "text-emerald-600 bg-emerald-100", tab: "payments" },
    { label: "Total Courses", value: statsData.totalCourses, icon: BookOpen, color: "text-green-600 bg-green-100", tab: "courses" },
    { label: "Pending Payments", value: statsData.pendingPayments, icon: Clock, color: "text-orange-600 bg-orange-100", tab: "payments" },
    { label: "Active Sessions", value: statsData.activeSessions, icon: Monitor, color: "text-cyan-600 bg-cyan-100", tab: "sessions" },
  ];

  const quickActions = [
    { label: "Batch Details", description: "View & manage batch rosters", icon: Users, tab: "batches", route: "/admin/batch-monitor" },
    { label: "Upload Content", description: "Add lectures, PDFs & videos", icon: Upload, tab: "content" },
    { label: "Live Classes", description: "Schedule & go live", icon: Radio, tab: "live", route: "/admin/live" },
    { label: "Payments", description: "Approve, reject & refund", icon: IndianRupee, tab: "payments" },
    { label: "Courses", description: "Create & edit courses", icon: BookOpen, tab: "courses" },
    { label: "Users", description: "Students, teachers & roles", icon: Users, tab: "users" },
    { label: "Enrollments", description: "Manual access & approvals", icon: UserCheck, tab: "enrollments" },
    { label: "Sessions", description: "Active devices & logout", icon: Monitor, tab: "sessions" },
  ];

  // Badge rendering lives in src/features/admin/components/AdminBadges.tsx and
  // is now used directly inside the extracted tab panels.

  // Loading state
  const [loadTimeout, setLoadTimeout] = useState(false);
  useEffect(() => {
    if (authLoading) {
      const timer = setTimeout(() => setLoadTimeout(true), 8000);
      return () => clearTimeout(timer);
    } else setLoadTimeout(false);
  }, [authLoading]);

  if (authLoading) {
    return (
    <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{loadTimeout ? "Taking longer than expected..." : "Loading..."}</p>
          {loadTimeout && <button onClick={() => window.location.reload()} className="mt-4 text-primary hover:underline text-sm font-medium">Refresh Page</button>}
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-6">You need admin privileges to access this page.</p>
            <Button onClick={() => navigate("/admin/login")} className="w-full">Go to Admin Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <main className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Manage your academy operations.</p>
          </div>
          <Button variant="outline" onClick={fetchDashboardData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* STATS — pinned above the tab strip so key numbers stay visible. */}
        <AdminStatsGrid stats={stats} onSelectTab={setActiveTab} />

        {/* TABS */}
        {/*
          PERF — Heavy <TabsContent> bodies (payments / users / teachers /
          courses / library / sessions) are wrapped in
          `{activeTab === 'X' && (<>...</>)}` below. Radix Tabs otherwise
          mounts every TabsContent child up-front (just display:none), which
          on this 1600-LOC admin page caused 12+ unused useEffects to fire
          and slowed first-paint on low-end Android. The fragment guard
          keeps inactive tabs unmounted until selected. Don't "clean up" by
          removing the guard.
        */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'sessions') fetchSessionsData(); }} className="w-full space-y-6">
        {/* Library tab no longer needs an eager fetch here — LibraryManager
            fetches itself on mount, and mount-on-demand (`activeTab === 'library'`)
            guarantees a fresh fetch every time the operator opens the tab. */}
          {/* Mobile-friendly horizontal chip row.
              ROOT CAUSE of the long-running "chip label is cut off / can't
              scroll right" bug: `TabsList`'s base class list contains
              `justify-center`. Nothing here overrode it, so tailwind-merge
              kept it — and a flex scroller with `justify-center` centers its
              OVERFLOWING content, pushing the start of the row into negative
              scroll space the browser can never reach. `justify-start` is
              therefore mandatory; do not remove it.
              Snap (`snap-x`) was also removed: it fought the programmatic
              centering below and re-clipped the active chip. */}

          <div className="relative w-full max-w-full rounded-lg border bg-card">
            <TabsList
              ref={tabsScrollerRef}
              className="bg-transparent border-0 rounded-lg w-full max-w-full overflow-x-auto overscroll-x-contain scrollbar-hide flex flex-nowrap justify-start h-auto gap-1 p-1 scroll-px-2"
              data-admin-tabs=""
            >

            <TabsTrigger data-tab="overview" value="overview" className="py-2 min-h-[44px] shrink-0 gap-1"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
            <TabsTrigger data-tab="courses" value="courses" className="py-2 min-h-[44px] shrink-0 gap-1"><BookOpen className="h-4 w-4" />Courses</TabsTrigger>
            <TabsTrigger data-tab="live" value="live" className="py-2 min-h-[44px] shrink-0 gap-1 text-destructive data-[state=active]:text-destructive"><Radio className="h-4 w-4" />Live</TabsTrigger>
            <TabsTrigger data-tab="payments" value="payments" className="py-2 min-h-[44px] shrink-0 gap-1">Payments <Badge variant="destructive" className="ml-1">{statsData.pendingPayments}</Badge></TabsTrigger>
            <TabsTrigger data-tab="users" value="users" className="py-2 min-h-[44px] shrink-0">Users</TabsTrigger>
            <TabsTrigger data-tab="teachers" value="teachers" className="py-2 min-h-[44px] shrink-0 gap-1"><GraduationCap className="h-4 w-4" />Teachers</TabsTrigger>
            <TabsTrigger data-tab="library" value="library" className="py-2 min-h-[44px] shrink-0 gap-1"><Library className="h-4 w-4" />Library</TabsTrigger>
            <TabsTrigger data-tab="doubts" value="doubts" className="py-2 min-h-[44px] shrink-0 gap-1"><MessageSquare className="h-4 w-4" />Doubts</TabsTrigger>
            <TabsTrigger data-tab="content" value="content" className="py-2 min-h-[44px] shrink-0 gap-1 text-primary data-[state=active]:text-primary font-semibold"><Upload className="h-4 w-4" />Upload</TabsTrigger>
            <TabsTrigger data-tab="schedule" value="schedule" className="py-2 min-h-[44px] shrink-0 gap-1"><Calendar className="h-4 w-4" />Schedule</TabsTrigger>
            <TabsTrigger data-tab="enrollments" value="enrollments" className="py-2 min-h-[44px] shrink-0 gap-1"><UserCheck className="h-4 w-4" />Enrollments</TabsTrigger>
            <TabsTrigger data-tab="banners" value="banners" className="py-2 min-h-[44px] shrink-0 gap-1"><ImageIcon className="h-4 w-4" />Banners</TabsTrigger>
            <TabsTrigger data-tab="landing-courses" value="landing-courses" className="py-2 min-h-[44px] shrink-0 gap-1"><BookOpen className="h-4 w-4" />Landing</TabsTrigger>
            <TabsTrigger data-tab="testimonials" value="testimonials" className="py-2 min-h-[44px] shrink-0 gap-1"><MessageSquare className="h-4 w-4" />Reviews</TabsTrigger>
           <TabsTrigger data-tab="social" value="social" className="py-2 min-h-[44px] shrink-0 gap-1"><ExternalLink className="h-4 w-4" />Social</TabsTrigger>
           <TabsTrigger data-tab="player-reader" value="player-reader" className="py-2 min-h-[44px] shrink-0 gap-1"><MonitorPlay className="h-4 w-4" />Player & Reader</TabsTrigger>
           <TabsTrigger data-tab="lesson-features" value="lesson-features" className="py-2 min-h-[44px] shrink-0 gap-1"><SlidersHorizontal className="h-4 w-4" />Lesson Features</TabsTrigger>
           <TabsTrigger data-tab="side-menu" value="side-menu" className="py-2 min-h-[44px] shrink-0 gap-1"><SlidersHorizontal className="h-4 w-4" />Side Menu</TabsTrigger>
           <TabsTrigger data-tab="sessions" value="sessions" className="py-2 min-h-[44px] shrink-0 gap-1"><Monitor className="h-4 w-4" />Sessions</TabsTrigger>

            <TabsTrigger data-tab="syllabus" value="syllabus" className="py-2 min-h-[44px] shrink-0 gap-1"><FileText className="h-4 w-4" />Syllabus</TabsTrigger>
            <TabsTrigger data-tab="timetable" value="timetable" className="py-2 min-h-[44px] shrink-0 gap-1"><Clock className="h-4 w-4" />Timetable</TabsTrigger>
          </TabsList>
          </div>




          {/* OVERVIEW TAB */}
          <TabsContent value="overview">{activeTab === 'overview' && (
            <AdminOverviewTab
              quickActions={quickActions}
              onSelectTab={setActiveTab}
              onNavigate={navigate}
            />
          )}</TabsContent>

          {/* PAYMENTS TAB */}
          <TabsContent value="payments">{activeTab === 'payments' && (
            <AdminPaymentsTab
              payments={filteredPayments}
              totalRevenue={statsData.totalRevenue}
              totals={paymentSummary}
              search={paymentSearch}
              onSearchChange={setPaymentSearch}
              statusFilter={paymentStatusFilter}
              onStatusFilterChange={setPaymentStatusFilter}
              refundingPayment={refundingPayment}
              onExport={() => exportToCSV(filteredPayments.map(p => ({
                method: p._method === 'razorpay' ? 'Razorpay' : 'UPI Manual',
                name: p._displayName, course: p._course, amount: p._amount, status: p._status, date: p._date,
                ref: p.transaction_id || p.razorpay_payment_id || '',
              })), 'payments')}
              onApprove={handleApprovePayment}
              onReject={handleRejectPayment}
              onRefund={openRefundDialog}
              onViewScreenshot={(req) => handleViewScreenshot(req.screenshot_url)}
            />
          )}</TabsContent>

          {/* USERS TAB */}
          <TabsContent value="users">{activeTab === 'users' && (
            <AdminUsersTab
              totalUsers={usersList.length}
              users={filteredUsers}
              search={userSearch}
              onSearchChange={setUserSearch}
              roleFilter={userRoleFilter}
              onRoleFilterChange={setUserRoleFilter}
              roleChanging={roleChanging}
              onChangeRole={handleChangeRole}
              onExport={() => exportToCSV(filteredUsers.map(u => ({
                full_name: u.full_name, email: u.email, mobile: u.mobile, role: u.role, created_at: u.created_at
              })), 'users')}
            />
          )}</TabsContent>

          {/* TEACHERS TAB */}
          <TabsContent value="teachers">{activeTab === 'teachers' && (
            <AdminTeachersTab
              activeTeachers={activeTeachers}
              promotableStudents={promotableStudents}
              search={teacherSearch}
              onSearchChange={setTeacherSearch}
              roleChanging={roleChanging}
              onChangeRole={handleChangeRole}
            />
          )}</TabsContent>

          {/* COURSES TAB */}
          <TabsContent value="courses">{activeTab === 'courses' && (
            <AdminCoursesTab
              newCourse={newCourse}
              onNewCourseChange={setNewCourse}
              isCreatingCourse={isCreatingCourse}
              onCreateCourse={handleCreateCourse}
              thumbnailFile={thumbnailFile}
              onThumbnailFileChange={setThumbnailFile}
              courseThumbnailUrl={courseThumbnailUrl}
              onCourseThumbnailUrlChange={setCourseThumbnailUrl}
              courseThumbnailMode={courseThumbnailMode}
              onCourseThumbnailModeChange={setCourseThumbnailMode}
              courses={filteredCourses}
              search={courseSearch}
              onSearchChange={setCourseSearch}
              onExport={() => exportToCSV(filteredCourses.map(c => ({
                title: c.title, description: c.description, price: c.price, grade: c.grade, created_at: c.created_at
              })), 'courses')}
              editingCourseId={editingCourseId}
              editCourseData={editCourseData}
              onEditCourseDataChange={setEditCourseData}
              editThumbnailFile={editThumbnailFile}
              onEditThumbnailFileChange={setEditThumbnailFile}
              editThumbnailUrl={editThumbnailUrl}
              onEditThumbnailUrlChange={setEditThumbnailUrl}
              editThumbnailMode={editThumbnailMode}
              onEditThumbnailModeChange={setEditThumbnailMode}
              onEditCourse={handleEditCourse}
              onSaveCourseEdit={handleSaveCourseEdit}
              onCancelEdit={() => setEditingCourseId(null)}
              onDeleteCourse={handleDeleteCourse}
              onToggleEnrollment={handleToggleEnrollment}
              onSaveSeatLimit={handleSaveSeatLimit}
              enrollmentCounts={enrollmentCounts}
              savingCourseId={savingCourseId}
            />
          )}</TabsContent>

          {/* CONTENT TAB — uses ContentDrillDown with built-in upload */}
          <TabsContent value="content">{activeTab === 'content' && (
            <Suspense fallback={<PanelFallback />}>
              <ContentDrillDown
                coursesList={coursesList}
                onNavigateToUpload={(courseId, chapterId) => navigate(`/admin/upload?course=${courseId}&chapter=${chapterId || ''}`)}
                onRefresh={fetchDashboardData}
              />
            </Suspense>
          )}</TabsContent>

          {/* SCHEDULE TAB */}
          <TabsContent value="schedule">
            <Card className="border shadow-sm">
              <CardHeader className="border-b pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 min-w-0 break-words">
                    <Calendar className="h-5 w-5 text-primary shrink-0" />
                    <span className="min-w-0">Lecture Schedule</span>
                  </CardTitle>
                  <Button size="sm" onClick={() => navigate('/admin/schedule')} className="gap-2 shrink-0 ml-auto">
                    <ExternalLink className="h-4 w-4" />
                    <span className="hidden xs:inline sm:inline">Open Full Schedule</span>
                    <span className="xs:hidden sm:hidden">Open</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-muted-foreground text-center py-8">Manage upcoming lecture schedules, create new sessions, and share meeting links with students.</p>
                <div className="flex justify-center gap-3 flex-wrap">
                  <Button variant="outline" onClick={() => navigate('/admin/schedule')} className="gap-2"><Plus className="h-4 w-4" /> Create & Manage Schedules</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/quiz')} className="gap-2"><ExternalLink className="h-4 w-4" /> Quiz Manager</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/study-materials')} className="gap-2"><Plus className="h-4 w-4" /> Study Materials</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/trusted-hosts')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Trusted Hosts / CSP</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/app-update')} className="gap-2"><ShieldAlert className="h-4 w-4" /> App Update & Notification</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/pdf-health')} className="gap-2"><ShieldAlert className="h-4 w-4" /> PDF Source Health</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/ai-health')} className="gap-2"><ShieldAlert className="h-4 w-4" /> AI Health / Diagnostics</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/security')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Dependency Security Scan</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/users')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Users & Block</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/moderation')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Content Moderation</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/fraud-watch')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Fraud Watch (Bypass Enrollments)</Button>
                  <Button variant="outline" onClick={() => navigate('/admin/batch-monitor')} className="gap-2"><ShieldAlert className="h-4 w-4" /> Batch Monitor (Who bought what)</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LIBRARY TAB */}
          {/* LIBRARY TAB — extracted to <LibraryManager />.
              Mount-on-demand (`activeTab === 'library'`) is preserved so the
              child only mounts when the operator opens this tab; React.memo
              on LibraryManager then prevents re-renders from sibling tab
              activity (coursesList is the only prop, and it's stable). */}
          <TabsContent value="library">
            {activeTab === 'library' && (
              <Suspense fallback={<PanelFallback />}><LibraryManager coursesList={coursesList} /></Suspense>
            )}
          </TabsContent>

           {/* PLAYER & READER TAB */}
           <TabsContent value="side-menu">{activeTab === 'side-menu' && <Suspense fallback={<PanelFallback />}><MenuFeatureControlsManager /></Suspense>}</TabsContent>
           <TabsContent value="lesson-features">{activeTab === 'lesson-features' && <Suspense fallback={<PanelFallback />}><LessonFeatureControlsManager /></Suspense>}</TabsContent>
           <TabsContent value="player-reader">{activeTab === 'player-reader' && <Suspense fallback={<PanelFallback />}><PlayerReaderControlsManager /></Suspense>}</TabsContent>

           {/* SOCIAL TAB */}
           <TabsContent value="social">{activeTab === 'social' && <Suspense fallback={<PanelFallback />}><SocialLinksManager /></Suspense>}</TabsContent>


          {/* LIVE TAB */}
          <TabsContent value="live">
            <div className="flex flex-col items-center gap-4 py-8 px-4 text-center">
              <div className="p-4 rounded-2xl bg-destructive/10"><Radio className="h-10 w-10 text-destructive" /></div>
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Live Class Manager</h2>
                <p className="text-muted-foreground text-sm max-w-sm">Schedule live YouTube sessions, go live with one click, manage chat and answer student doubts in real-time.</p>
              </div>
              <button onClick={() => navigate("/admin/live")} className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
                <Radio className="h-4 w-4" /> Open Live Manager
              </button>
            </div>
          </TabsContent>

          {/* BANNERS TAB */}
          <TabsContent value="banners">{activeTab === 'banners' && <Suspense fallback={<PanelFallback />}><HeroBannerManager /></Suspense>}</TabsContent>
          <TabsContent value="landing-courses">{activeTab === 'landing-courses' && <Suspense fallback={<PanelFallback />}><LandingCoursesManager /></Suspense>}</TabsContent>
          <TabsContent value="testimonials">{activeTab === 'testimonials' && <Suspense fallback={<PanelFallback />}><TestimonialsManager /></Suspense>}</TabsContent>

          {/* DOUBTS TAB */}
          <TabsContent value="doubts">
            <div className="flex flex-col items-center gap-4 py-8 px-4 text-center">
              <div className="p-4 rounded-2xl bg-primary/10"><MessageSquare className="h-10 w-10 text-primary" /></div>
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Zoom Doubt Sessions</h2>
                <p className="text-muted-foreground text-sm max-w-sm">View all student doubt requests, create Zoom meetings, and manage 1:1 sessions.</p>
              </div>
              <button onClick={() => navigate("/doubts")} className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
                <MessageSquare className="h-4 w-4" /> Open Doubt Manager
              </button>
            </div>
          </TabsContent>

          {/* SESSIONS TAB */}
          <TabsContent value="sessions">{activeTab === 'sessions' && (
            <AdminSessionsTab
              sessions={sessionsList}
              loading={sessionsLoading}
              terminatingSession={terminatingSession}
              onRefresh={fetchSessionsData}
              onForceLogout={handleForceLogout}
            />
          )}</TabsContent>

          {/* ENROLLMENTS TAB - Manual Course Access */}
          <TabsContent value="enrollments">{activeTab === 'enrollments' && (
            <Suspense fallback={<PanelFallback />}>
              <EnrollmentManager coursesList={coursesList} usersList={usersList} />
            </Suspense>
          )}</TabsContent>

          {/* SYLLABUS TAB */}
          <TabsContent value="syllabus">{activeTab === 'syllabus' && (
            <Suspense fallback={<PanelFallback />}><SyllabusManager /></Suspense>
          )}</TabsContent>

          {/* TIMETABLE TAB */}
          <TabsContent value="timetable">{activeTab === 'timetable' && (
            <Suspense fallback={<PanelFallback />}><TimetableManager /></Suspense>
          )}</TabsContent>

        </Tabs>
      </main>


      {/* REFUND CONFIRMATION DIALOG */}
      <AdminRefundDialog
        payment={refundConfirmPayment}
        confirmText={refundConfirmText}
        onConfirmTextChange={setRefundConfirmText}
        amountText={refundAmountText}
        onAmountTextChange={setRefundAmountText}
        onCancel={closeRefundDialog}
        onConfirm={handleInitiateRefund}
      />
    </div>
  );
};

export default Admin;
