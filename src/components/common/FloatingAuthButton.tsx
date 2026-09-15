import { Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Floating Login / Sign Up pill — fixed at the bottom of the landing page
 * for guests only. Hidden once the user is signed in.
 * Sits above the mobile safe-area and clears the WhatsApp FAB column
 * by anchoring to the bottom-left on small screens.
 */
const FloatingAuthButton = () => {
  const { user, isLoading } = useAuth();

  if (isLoading || user) return null;

  return (
    <div
      className="fixed left-4 right-4 sm:left-auto sm:right-6 z-40 flex justify-center sm:justify-end"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-card/95 p-1.5 shadow-lg shadow-primary/10 backdrop-blur">
        <Link
          to="/login"
          aria-label="Login"
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          Login
        </Link>
        <Link
          to="/signup"
          aria-label="Sign up"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 active:scale-95 transition"
        >
          Sign Up
        </Link>
      </div>
    </div>
  );
};

export default FloatingAuthButton;
