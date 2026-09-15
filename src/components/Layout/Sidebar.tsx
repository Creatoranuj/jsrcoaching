import { useEffect, useRef, useState } from "react";
import { X, Home, BookOpen, Users, Calendar, FileText, MessageCircle, Settings, LogOut, User, Bell, Library, ShieldCheck, Bot, Download, Video } from "lucide-react";
import { GraduationCap } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useMenuFeatureFlags, type MenuFeatureFlag } from "@/hooks/useMenuFeatureFlags";
import { toast } from "sonner";
import { tapHaptic, selectionHaptic } from "@/lib/native/haptics";
import logo from "../../assets/branding/jsr-mark.webp";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
  adminOrTeacher?: boolean;
  menuFlag?: MenuFeatureFlag;
}

const menuItems: MenuItem[] = [
  { icon: Home, label: "Dashboard", path: "/dashboard" },
  { icon: GraduationCap, label: "My Courses", path: "/my-courses" },
  { icon: BookOpen, label: "Courses", path: "/courses" },
  { icon: Library, label: "Books", path: "/books" },
  { icon: Download, label: "Downloads", path: "/downloads" },
  { icon: Video, label: "Doubt Sessions", path: "/doubts", menuFlag: "doubts" },
  
  { icon: Bell, label: "Notices", path: "/notices" },
  { icon: Users, label: "Community", path: "/community", menuFlag: "community" },
  { icon: Users, label: "Students", path: "/students", adminOrTeacher: true },
  { icon: Calendar, label: "Attendance", path: "/attendance", adminOrTeacher: true },
  { icon: FileText, label: "Reports", path: "/reports", menuFlag: "reports" },
  { icon: MessageCircle, label: "Messages", path: "/messages", menuFlag: "messages" },
  { icon: User, label: "Profile", path: "/profile" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, logout, isAuthenticated, isAdmin, isTeacher } = useAuth();

  const handleLogout = () => {
    void tapHaptic("medium");
    logout();
    onClose();
    toast.success("Logged out successfully");
    navigate("/");
  };

  const menuFlags = useMenuFeatureFlags();
  const staffBypass = isAdmin || isTeacher;

  const visibleItems = menuItems.filter(item => {
    if (item.adminOrTeacher) return staffBypass;
    // Admin-controlled section switches. Staff always see them; students only
    // while the flag is ON (unset / still loading counts as ON).
    if (item.menuFlag && !staffBypass && !menuFlags.isLoading && !menuFlags[item.menuFlag]) return false;
    return true;
  });

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Swipe-to-close: drag the sidebar left → follows finger, releases into
  // close when past threshold. Keeps native/Lovable-like feel.
  const [dragX, setDragX] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; active: boolean }>({
    startX: 0,
    startY: 0,
    active: false,
  });

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    dragRef.current = { startX: t.clientX, startY: t.clientY, active: true };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current.active) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - dragRef.current.startX;
    const dy = Math.abs(t.clientY - dragRef.current.startY);
    if (dy > 40 && Math.abs(dx) < 20) {
      // Vertical scroll — abandon.
      dragRef.current.active = false;
      setDragX(0);
      return;
    }
    setDragX(Math.min(0, dx));
  };
  const onTouchEnd = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const closed = dragX < -70;
    setDragX(0);
    if (closed) onClose();
  };

  useEffect(() => {
    if (!isOpen) setDragX(0);
  }, [isOpen]);

  const getIsActive = (path: string) =>
    path === "/dashboard"
      ? location.pathname === path
      : location.pathname.startsWith(path);

  return (
    <>
      {/* Backdrop — iOS-style ease matched to sidebar transform */}
      <div
        className={cn(
          "fixed inset-0 bg-foreground/25 backdrop-blur-sm z-[80]",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        style={
          isOpen && dragX < 0
            ? {
                opacity: Math.max(0, 1 + dragX / 288),
                transition: "none",
              }
            : {
                transition:
                  "opacity 320ms cubic-bezier(0.32, 0.72, 0, 1)",
              }
        }
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={
          isOpen && dragX < 0
            ? { transform: `translateX(${dragX}px)`, transition: "none" }
            : {
                transition:
                  "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
              }
        }
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-sidebar z-[90] shadow-2xl flex flex-col pl-safe-l touch-pan-y will-change-transform",
          isOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
        )}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pt-safe-t border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="JSR COACHING"
              width={40}
              height={40}
              loading="eager"
              decoding="async"
              className="h-10 w-10 rounded-lg object-contain bg-white p-1 ring-1 ring-white/15"
            />
            <span className="font-bold text-lg text-sidebar-foreground">
              JSR COACHING
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { void selectionHaptic(); onClose(); }}
            className="text-sidebar-foreground hover:bg-sidebar-accent active:scale-95 transition-transform duration-150"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = getIsActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => { void selectionHaptic(); onClose(); }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 mx-2 rounded-xl transition-all duration-150 active:scale-[0.99]",
                  active
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:bg-sidebar-accent/70"
                )}
              >
                <item.icon className={cn("h-5 w-5", active && "text-primary")} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* Admin Links — admin only */}
          {isAuthenticated && isAdmin && (
            <>
              <Link
                to="/admin"
                onClick={() => { void selectionHaptic(); onClose(); }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 mx-2 mt-2 rounded-xl transition-all duration-150 active:scale-[0.99]",
                  location.pathname === "/admin"
                    ? "bg-primary/15 text-primary font-semibold"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                <ShieldCheck className="h-5 w-5" />
                <span className="font-medium">Admin Panel</span>
              </Link>
              <Link
                to="/admin/chatbot"
                onClick={() => { void selectionHaptic(); onClose(); }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 mx-2 mt-1 rounded-xl transition-all duration-150 active:scale-[0.99]",
                  getIsActive("/admin/chatbot")
                    ? "bg-primary/15 text-primary font-semibold"
                    : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                <Bot className="h-5 w-5" />
                <span className="font-medium">Chatbot Settings</span>
              </Link>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 pb-safe-b border-t border-sidebar-border">
          {isAuthenticated && user && (
            <div className="mb-3 px-2">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.fullName || 'User'}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
            </div>
          )}
          {isAuthenticated ? (
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:scale-[0.97] transition-transform duration-150"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </Button>
          ) : (
            <Link to="/login" onClick={() => { void selectionHaptic(); onClose(); }}>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:scale-[0.97] transition-transform duration-150"
              >
                <LogOut className="h-5 w-5" />
                <span>Login</span>
              </Button>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
