import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, Wrench, ArrowLeft } from "lucide-react";
import logo from "@/assets/branding/jsr-mark.webp";

/**
 * PhoneLogin is temporarily disabled while the SMS OTP provider is being
 * migrated. Users are shown a clear under-construction notice and pointed
 * back to email sign-in so no one is stranded.
 */
const PhoneLogin = () => {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="JSR COACHING" className="h-16 w-16 rounded-full object-contain" />
          <h1 className="text-2xl font-bold text-foreground">Phone sign-in</h1>
        </div>

        <div
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left flex gap-3"
        >
          <Wrench className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Under construction</p>
            <p className="text-sm text-muted-foreground">
              OTP login is temporarily unavailable. Please sign in with your email for now — we&apos;ll
              restore phone login shortly.
            </p>
          </div>
        </div>

        <Link to="/login" className="block">
          <Button className="w-full h-12 gap-2">
            <Mail className="h-4 w-4" /> Sign in with email
          </Button>
        </Link>

        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to home
        </Link>
      </div>
    </main>
  );
};

export default PhoneLogin;
