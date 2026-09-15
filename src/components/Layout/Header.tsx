import { User } from "lucide-react";
import { HamburgerIcon } from "../icons/HamburgerIcon";
import { Button } from "../ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useIsMobile } from "../../hooks/use-mobile";
import { selectionHaptic } from "@/lib/native/haptics";
import logoIcon from "../../assets/branding/jsr-mark.webp";
import NotificationDropdown from "./NotificationDropdown";
import ProfileAvatar from "../profile/ProfileAvatar";

interface HeaderProps {
  onMenuClick: () => void;
  userName?: string;
}

const Header = ({ onMenuClick, userName }: HeaderProps) => {
  const { user, profile, isAuthenticated } = useAuth();
  const isMobile = useIsMobile();
  const displayName = profile?.fullName ?? userName;

  return (
    <>
    <header
      className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between px-2 pl-safe-l pr-safe-r md:px-4 py-1.5 pt-safe-t bg-card border-b border-border min-h-[calc(env(safe-area-inset-top,0px)+52px)] md:min-h-[calc(env(safe-area-inset-top,0px)+60px)] shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { void selectionHaptic(); onMenuClick(); }}
          className="text-foreground/80 hover:text-foreground hover:bg-muted/60 h-11 w-11 -ml-1 active:scale-95 transition-all duration-150 ease-out"
          aria-label="Open menu"
        >
          <HamburgerIcon className="h-[18px] w-[18px]" />
        </Button>
        <Link to="/" onClick={() => { void selectionHaptic(); }} className="flex items-center gap-2 active:scale-[0.98] transition-transform duration-150" style={{ padding: '0 2px' }}>
          <img
            src={logoIcon}
            alt="JSR COACHING"
            className="h-8 w-8 rounded-full object-contain"
            width={32}
            height={32}
          />
          {!isMobile && (
            <span className="font-semibold text-lg text-foreground">
              JSR COACHING
            </span>
          )}
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <NotificationDropdown />
        {isAuthenticated ? (
          <Link to="/profile" onClick={() => { void selectionHaptic(); }}>
            <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted h-11 w-11 relative active:scale-95 transition-transform duration-150" aria-label="Profile">
              <ProfileAvatar
                avatarUrl={profile?.avatarUrl ?? null}
                fullName={displayName}
                userId={user?.id}
                size="sm"
              />
            </Button>
          </Link>
        ) : (
          <Link to="/login" onClick={() => { void selectionHaptic(); }}>
            <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted active:scale-95 transition-transform duration-150" aria-label="Sign in">
              <User className="h-5 w-5" />
            </Button>
          </Link>
        )}
      </div>
    </header>
    <div aria-hidden="true" className="shrink-0 min-h-[calc(env(safe-area-inset-top,0px)+52px)] md:min-h-[calc(env(safe-area-inset-top,0px)+60px)]" />
    </>
  );
};

export default Header;
