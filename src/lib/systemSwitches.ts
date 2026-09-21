/**
 * Survival Mode — saare kill-switches ek hi jagah.
 *
 * Kyun: kabhi server par load bahut badh jaye, koi third-party service down ho,
 * ya bill bachana ho — to admin ek-ek cheez band kar sake, bina app tode.
 *
 * Do sakht niyam:
 * 1. Missing key = ON. Yaani aaj `site_settings` me kuch bhi nahi hai, to app ka
 *    behaviour bilkul waisa hi rahega jaisa abhi hai. Koi surprise nahi.
 * 2. PROTECTED cheezein kabhi band nahi hoti — chahe DB me `false` hi kyun na
 *    likha ho. Login, My Courses, chapter, lesson, PDF, video aur payment
 *    hamesha chalte rahenge.
 *
 * Storage: wahi `site_settings` table (key/value text), wahi cached read
 * (`siteSettingsCache`) — koi nayi table, koi extra query nahi.
 */

/** Student-facing features jinhe admin band kar sakta hai. */
export const FEATURE_SWITCHES = {
  doubts: "sys_feature_doubts",
  community: "sys_feature_community",
  messages: "sys_feature_messages",
  reports: "sys_feature_reports",
  notices: "sys_feature_notices",
  downloads: "sys_feature_downloads",
  quiz: "sys_feature_quiz",
  live: "sys_feature_live",
  books: "sys_feature_books",
  library: "sys_feature_library",
  aiAssistant: "sys_feature_ai_assistant",
  search: "sys_feature_search",
  notifications: "sys_feature_notifications",
} as const;

export type FeatureSwitch = keyof typeof FEATURE_SWITCHES;

/** Edge functions jinhe admin band kar sakta hai (naam = function ka folder). */
export const EDGE_FUNCTION_SWITCHES = [
  "ai-health",
  "app-download",
  "bunny-cdn",
  "chatbot",
  "content-redirect",
  "crawl4ai-bridge",
  "create-zoom-meeting",
  "deep-search-lecture",
  "dependency-scan",
  "fetch-youtube-transcript",
  "firecrawl-scrape",
  "generate-embedding",
  "get-zoom-signature",
  "import-banner-image",
  "initiate-refund",
  "notify-ai",
  "notion-page",
  "platform-stats",
  "reconcile-pending-payments",
  "recover-enrollment",
  "request-account-deletion",
  "resolve-doubt",
  "seed-knowledge",
  "send-push",
  "summarize-video",
  "validate-email",
] as const;

export type EdgeFunctionSwitch = (typeof EDGE_FUNCTION_SWITCHES)[number];

/** Edge function ka switch key. */
export function edgeSwitchKey(fn: string): string {
  return `sys_edge_${fn.replace(/-/g, "_")}`;
}

/**
 * Ye kabhi band nahi hoti. Padhai aur paisa — dono ka rasta hamesha khula.
 * Yahan client-side feature/route naam aur edge function naam dono hain.
 */
export const PROTECTED_KEYS: readonly string[] = [
  // Login / account
  "login",
  "signup",
  "phone-otp",
  "send-phone-otp",
  "verify-phone-otp",
  "manage-session",
  // Padhai ka core rasta
  "my-courses",
  "course",
  "chapter",
  "lesson",
  "pdf",
  "video",
  "get-lesson-url",
  "get-video-stream",
  "pdf-proxy",
  "resolve-storage-pdf",
  // Paisa
  "payment",
  "create-razorpay-order",
  "create-subscription-order",
  "verify-razorpay-payment",
  "verify-subscription-payment",
  "razorpay-webhook",
  "razorpay-refund-webhook",
  "self-enroll-free",
  "start-subscription-trial",
  // Exam
  "score-quiz",
];

const PROTECTED_SET = new Set(PROTECTED_KEYS);

/** Kya ye cheez hamesha ON rehni chahiye? */
export function isProtected(name: string): boolean {
  return PROTECTED_SET.has(name);
}

/** "false"/"0"/"off"/"no" ke alawa sab kuch ON maana jayega. */
export function parseSwitchValue(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true; // missing = ON
  const v = value.trim().toLowerCase();
  if (v === "") return true;
  return !(v === "false" || v === "0" || v === "off" || v === "no");
}

export type SwitchRow = { key: string; value: string | null };

/** site_settings rows → { key: boolean } map, sirf sys_* keys. */
export function parseSwitchRows(rows: readonly SwitchRow[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const row of rows) {
    if (!row || typeof row.key !== "string") continue;
    if (!row.key.startsWith("sys_")) continue;
    out[row.key] = parseSwitchValue(row.value);
  }
  return out;
}

/** Ek feature ON hai ya nahi. Protected hamesha true. */
export function isFeatureOn(
  feature: FeatureSwitch,
  switches: Record<string, boolean> | undefined | null,
): boolean {
  if (isProtected(feature)) return true;
  const key = FEATURE_SWITCHES[feature];
  if (!switches) return true;
  const v = switches[key];
  return v === undefined ? true : v;
}

/** Ek edge function ON hai ya nahi. Protected hamesha true. */
export function isEdgeFunctionOn(
  fn: string,
  switches: Record<string, boolean> | undefined | null,
): boolean {
  if (isProtected(fn)) return true;
  if (!switches) return true;
  const v = switches[edgeSwitchKey(fn)];
  return v === undefined ? true : v;
}

/**
 * Purane menu flags jo pehle se app me hain. Naya switch inhe bhi saath me
 * likh deta hai, taaki side menu aur naya panel kabhi alag-alag na bole.
 */
export const LEGACY_ALIASES: Partial<Record<FeatureSwitch, string[]>> = {
  doubts: ["menu_doubts"],
  community: ["menu_community"],
  messages: ["menu_messages"],
  reports: ["menu_reports"],
};

/** Admin UI ke liye: saari keys jo padhni hain. */
export const ALL_SWITCH_KEYS: readonly string[] = [
  ...Object.values(FEATURE_SWITCHES),
  ...EDGE_FUNCTION_SWITCHES.map(edgeSwitchKey),
];

/** Survival Mode master: ek hi baar me band karne wali cheezein (protected chhodkar). */
export const SURVIVAL_MODE_OFF_KEYS: readonly string[] = [
  "menu_community",
  "menu_doubts",
  "menu_messages",
  "menu_reports",
  FEATURE_SWITCHES.community,
  FEATURE_SWITCHES.doubts,
  FEATURE_SWITCHES.messages,
  FEATURE_SWITCHES.reports,
  FEATURE_SWITCHES.aiAssistant,
  FEATURE_SWITCHES.search,
  FEATURE_SWITCHES.notifications,
  edgeSwitchKey("chatbot"),
  edgeSwitchKey("resolve-doubt"),
  edgeSwitchKey("deep-search-lecture"),
  edgeSwitchKey("generate-embedding"),
  edgeSwitchKey("fetch-youtube-transcript"),
  edgeSwitchKey("summarize-video"),
  edgeSwitchKey("firecrawl-scrape"),
  edgeSwitchKey("crawl4ai-bridge"),
  edgeSwitchKey("notion-page"),
  edgeSwitchKey("seed-knowledge"),
  edgeSwitchKey("ai-health"),
  edgeSwitchKey("dependency-scan"),
  edgeSwitchKey("platform-stats"),
  edgeSwitchKey("send-push"),
  edgeSwitchKey("notify-ai"),
];

/** Har feature ke liye seedha-saral Hinglish naam (admin screen ke liye). */
export const FEATURE_LABELS: Record<FeatureSwitch, string> = {
  doubts: "Doubt Sessions",
  community: "Community",
  messages: "Messages",
  reports: "Reports",
  notices: "Notices",
  downloads: "Downloads",
  quiz: "Quiz / Tests",
  live: "Live Classes",
  books: "Books",
  library: "Library",
  aiAssistant: "JSR AI Assistant",
  search: "Search",
  notifications: "Push Notifications",
};
