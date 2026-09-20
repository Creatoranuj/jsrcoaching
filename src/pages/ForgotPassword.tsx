/**
 * ForgotPassword.tsx
 * ===================
 * Password reset request page using Supabase Auth.
 *
 * The reset link is built with `authRedirectUrl()` — never
 * `window.location.origin` — because inside the APK the origin is
 * `https://localhost` and the emailed link would be unopenable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { reportError } from "@/lib/sentry";
import { Link } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { authRedirectUrl } from "@/lib/authRedirect";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Mail, CheckCircle, Loader2, Phone, HelpCircle } from "lucide-react";
import logo from "../assets/branding/jsr-mark.webp";
import { getErrorMessage } from "@/lib/errorMessage";

const RESEND_COOLDOWN_SECONDS = 60;

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // "Forgot which email?" — look the account up by registered mobile number.
  const [showLookup, setShowLookup] = useState(false);
  const [mobile, setMobile] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [emailHint, setEmailHint] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [cooldown]);

  const sendResetEmail = useCallback(async (address: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: authRedirectUrl("/reset-password"),
      });
      if (error) throw error;

      setEmailSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success("Password reset email sent!");
    } catch (err: unknown) {
      reportError(err, { surface: "ForgotPassword.submit" });
      toast.error(getErrorMessage(err) || "Failed to send reset email");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) {
      toast.error("Please enter your email address");
      return;
    }
    await sendResetEmail(address);
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = mobile.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Please enter your 10-digit mobile number");
      return;
    }

    setLookupBusy(true);
    setEmailHint(null);
    try {
      const { data, error } = await supabase.rpc("lookup_email_hint", {
        p_mobile: digits,
      });
      if (error) throw error;

      if (!data) {
        toast.error("No account found with that mobile number");
        return;
      }
      setEmailHint(data as string);
    } catch (err: unknown) {
      reportError(err, { surface: "ForgotPassword.lookup" });
      toast.error(getErrorMessage(err) || "Could not look up your account");
    } finally {
      setLookupBusy(false);
    }
  };

  return (
    <main className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 mb-8 justify-center">
          <img src={logo} alt="JSR COACHING" className="h-12 w-12 rounded-xl" />
          <span className="font-bold text-2xl text-foreground">JSR COACHING</span>
        </Link>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Reset Password</CardTitle>
            <CardDescription>
              {emailSent
                ? "Check your email for the reset link"
                : "Enter your email to receive a password reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-muted-foreground mb-2">
                  We've sent a password reset link to <strong>{email.trim()}</strong>.
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  Can't find it? Check your <strong>Spam</strong> or <strong>Promotions</strong>{" "}
                  folder. The link opens this app directly.
                </p>
                <Button
                  variant="outline"
                  onClick={() => void sendResetEmail(email.trim())}
                  className="w-full h-12"
                  disabled={isLoading || cooldown > 0}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : cooldown > 0 ? (
                    `Resend in ${cooldown}s`
                  ) : (
                    "Resend Email"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setEmailSent(false)}
                  className="w-full mt-2"
                >
                  Use a different email
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-12 text-base"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Sending...
                      </>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                </form>

                <div className="mt-5 border-t border-border pt-4">
                  {!showLookup ? (
                    <button
                      type="button"
                      onClick={() => setShowLookup(true)}
                      className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                    >
                      <HelpCircle className="h-4 w-4" />
                      Don't remember your email?
                    </button>
                  ) : (
                    <form onSubmit={handleLookup} className="space-y-3">
                      <Label htmlFor="mobile" className="text-sm">
                        Find your email with your registered mobile number
                      </Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="mobile"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            placeholder="10-digit mobile"
                            value={mobile}
                            onChange={(e) => setMobile(e.target.value)}
                            className="pl-9 h-11 text-base"
                          />
                        </div>
                        <Button
                          type="submit"
                          variant="secondary"
                          className="h-11"
                          disabled={lookupBusy}
                        >
                          {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
                        </Button>
                      </div>
                      {emailHint && (
                        <p className="text-sm text-foreground bg-muted rounded-lg px-3 py-2">
                          Your account email looks like{" "}
                          <strong className="font-mono">{emailHint}</strong>. Type the full
                          address above to get the reset link.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        For your safety we only show a partial email, never the full address.
                      </p>
                    </form>
                  )}
                </div>
              </>
            )}

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default ForgotPassword;
