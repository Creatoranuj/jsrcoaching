import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import BottomNav from "./BottomNav";

/**
 * Mounts BottomNav once at the app root so the tab bar is FROZEN at the bottom
 * of every authenticated screen instead of being re-rendered (and forgotten)
 * by each page. The nav itself is already `position: fixed`, so this just
 * guarantees presence + a single instance.
 *
 * Also toggles `data-has-bottom-nav` on <body> so global CSS can reserve
 * scroll padding — prevents the tab bar from overlapping the last list item
 * (e.g. Zoology on the My Courses → Subjects screen).
 */
const HIDE_EXACT = new Set<string>([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/admin/login",
  "/admin/register",
  "/install",
  "/privacy",
  "/delete-account",
  
]);

const HIDE_PREFIX = ["/quiz/", "/live/", "/teacher/live/", "/buy-course", "/payment-callback"];

const isLessonViewPath = (pathname: string) =>
  /^\/classes\/[^/]+\/lessons\/?$/.test(pathname);

export default function GlobalBottomNav() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();

  // DocumentReader sets `data-reader-open` on <body> while open so we can
  // hide the tab bar regardless of route (downloads, library, etc).
  const [readerOpen, setReaderOpen] = useState<boolean>(() =>
    typeof document !== "undefined" && document.body.hasAttribute("data-reader-open")
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setReaderOpen(document.body.hasAttribute("data-reader-open"));
    const obs = new MutationObserver(update);
    obs.observe(document.body, { attributes: true, attributeFilter: ["data-reader-open"] });
    update();
    return () => obs.disconnect();
  }, []);

  const hidden =
    !isAuthenticated ||
    readerOpen ||
    HIDE_EXACT.has(pathname) ||
    isLessonViewPath(pathname) ||
    HIDE_PREFIX.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (hidden) {
      document.body.removeAttribute("data-has-bottom-nav");
    } else {
      document.body.setAttribute("data-has-bottom-nav", "true");
    }
    return () => {
      document.body.removeAttribute("data-has-bottom-nav");
    };
  }, [hidden]);

  if (hidden) return null;
  return <BottomNav />;
}
