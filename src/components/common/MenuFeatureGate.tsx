import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useMenuFeatureFlags, type MenuFeatureFlag } from "@/hooks/useMenuFeatureFlags";

interface MenuFeatureGateProps {
  flag: MenuFeatureFlag;
  label: string;
  children: React.ReactNode;
}

/**
 * Blocks a section that an admin has switched OFF in Admin Panel → Side Menu.
 *
 * Admin/teacher always pass through (they need to verify the section), and the
 * gate stays open while the flag is still loading so nothing flashes away.
 */
const MenuFeatureGate = ({ flag, label, children }: MenuFeatureGateProps) => {
  const navigate = useNavigate();
  const { isAdmin, isTeacher } = useAuth();
  const flags = useMenuFeatureFlags();
  const notified = useRef(false);

  const staffBypass = isAdmin || isTeacher;
  const blocked = !flags.isLoading && !staffBypass && !flags[flag];

  useEffect(() => {
    if (!blocked || notified.current) return;
    notified.current = true;
    toast.info(`${label} abhi band hai.`, { id: `menu-gate-${flag}` });
    navigate("/dashboard", { replace: true });
  }, [blocked, flag, label, navigate]);

  if (blocked) return null;
  return <>{children}</>;
};

export default MenuFeatureGate;
