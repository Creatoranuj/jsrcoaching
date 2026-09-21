import { useNavigate } from "react-router-dom";
import { ArrowLeft, LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import SystemSwitchManager from "@/components/admin/SystemSwitchManager";

/**
 * /admin/system — Survival Mode ka control room.
 *
 * Yahan se admin har feature aur har server function ko ON/OFF kar sakta hai,
 * ya ek button se "Survival Mode" chalu kar sakta hai. Padhai aur payment wale
 * raste hamesha chalte rehte hain.
 */
export default function AdminSystem() {
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Admin
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2 min-w-0">
            <LifeBuoy className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-lg md:text-xl font-semibold truncate">System & Survival Mode</h1>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Yahan har cheez ka apna switch hai. Kuch bhi OFF karne se app tootega nahi — sirf wo
          hissa chhup jayega aur server par bhi band ho jayega. Wapas ON karna bhi ek tap.
        </p>

        <SystemSwitchManager />
      </div>
    </main>
  );
}
