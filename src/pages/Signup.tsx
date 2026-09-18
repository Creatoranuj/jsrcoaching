import { useState, useRef, useEffect } from "react";
import { reportError } from "@/lib/sentry";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, UserPlus, Loader2, AlertCircle, WifiOff, RefreshCw } from "lucide-react";
import logo from "../assets/branding/jsr-mark.webp";
import { validateEmailDomain } from "../lib/emailBlocklist";
import { checkPasswordStrength, type PasswordStrength } from "../lib/passwordStrength";
import { getErrorMessage } from "@/lib/errorMessage";

const strengthColors: Record<PasswordStrength, string> = {
  weak: "bg-destructive",
  fair: "bg-yellow-500",
  strong: "bg-green-500",
};

const Signup = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const navigate = useNavigate();
  const { signup, isAuthenticated, isLoading: authLoading } = useAuth();
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards setState-after-unmount for the async signup handler below.
  const aliveRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const passwordCheck = password.length > 0 ? checkPasswordStrength(password) : null;

  // Auto-navigate if user gets auto-confirmed and logged in
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      toast.success("Account ready — chalo shuru karte hain");
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Cleanup timer + abort in-flight requests on unmount
  useEffect(() => {
    aliveRef.current = true;
    const submitTimer = submitTimerRef;
    const abortController = abortRef;
    return () => {
      aliveRef.current = false;
      if (submitTimer.current) clearTimeout(submitTimer.current);
      abortController.current?.abort();
    };
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErrorMessage(null);
    setIsNetworkError(false);

    if (!name || !email || !password || !confirmPassword) {
      setErrorMessage("Please fill in all fields");
      return;
    }

    if (!navigator.onLine) {
      setErrorMessage("You appear to be offline. Please check your internet connection.");
      setIsNetworkError(true);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    if (passwordCheck && passwordCheck.errors.length > 0 && passwordCheck.strength === "weak") {
      setErrorMessage(passwordCheck.errors[0]);
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    const emailError = validateEmailDomain(email.trim());
    if (emailError) {
      setErrorMessage(emailError);
      return;
    }

    // Server-side disposable email check (defense-in-depth).
    // Uses supabase.functions.invoke so it works in the native APK
    // (no Express proxy in production).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { data: serverCheck } = await supabase.functions.invoke("validate-email", {
        body: { email: email.trim() },
      });
      if (!aliveRef.current || controller.signal.aborted) return;
      if (serverCheck?.blocked) {
        setErrorMessage(serverCheck.reason || "This email provider is not allowed.");
        return;
      }
    } catch {
      // If server check fails, continue with client-side validation only
      if (!aliveRef.current || controller.signal.aborted) return;
    }

    try {
      setIsLoading(true);

      const result = await signup(email.trim(), password, name);
      if (!aliveRef.current || controller.signal.aborted) return;

      if (result.error) {
        const msg = result.error.message?.toLowerCase() || "";
        const isNetwork = /network|fetch|timeout|abort|timed|connection/i.test(result.error.message || "");
        setIsNetworkError(isNetwork);

        if (msg.includes("already registered") || msg.includes("already been registered")) {
          setErrorMessage("This email is already registered. Please sign in instead.");
        } else if (isNetwork) {
          setErrorMessage("Network error — check your internet connection and try again.");
        } else if (msg.includes("password") && msg.includes("characters")) {
          setErrorMessage("Password must be at least 6 characters long.");
        } else {
          setErrorMessage(result.error.message || "Failed to create account");
        }
        return;
      }
      
      // If auto-confirmed, onAuthStateChange will fire and the useEffect above navigates.
      // If email confirmation required, redirect to login.
      const { data: { session } } = await supabase.auth.getSession();
      if (!aliveRef.current || controller.signal.aborted) return;
      if (!session) {
        toast.success("Account created! Please check your email to verify, then sign in.", { duration: 5000 });
        navigate("/login", { replace: true });
      }
      // else: auto-confirmed — useEffect handles navigation
      
    } catch (error: unknown) {
      if (!aliveRef.current || controller.signal.aborted) return;
      reportError(error, { surface: "Signup.submit" });
      const isNetwork = /network|fetch|timeout|abort|timed|connection/i.test(getErrorMessage(error) || "");
      setIsNetworkError(isNetwork);
      setErrorMessage(isNetwork
        ? "Network error — check your internet connection and try again."
        : (getErrorMessage(error) || "Failed to create account"));
    } finally {
      if (aliveRef.current && !controller.signal.aborted) setIsLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-background flex">
      <div className="hidden lg:flex flex-1 bg-secondary items-center justify-center p-12">
        <div className="max-w-lg text-center text-secondary-foreground">
          <div className="w-24 h-24 mx-auto mb-8 bg-secondary-foreground/20 rounded-3xl flex items-center justify-center">
            <img src={logo} alt="JSR COACHING" width={64} height={64} loading="eager" decoding="async" className="h-16 w-16 rounded-xl" />
          </div>
          <h2 className="text-3xl font-bold mb-4">English aaj se, roz thoda</h2>
          <p className="text-secondary-foreground/80 text-lg">
            Account banao aur apni classes, notes aur doubts ek jagah lao.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center px-5 sm:px-8 py-8 sm:py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="flex items-center gap-3 mb-8 lg:hidden">
            <img src={logo} alt="JSR COACHING" width={48} height={48} loading="eager" decoding="async" className="h-12 w-12 rounded-xl" />
            <span className="font-bold text-2xl text-foreground">JSR COACHING</span>
          </Link>

          <h1 className="text-3xl font-bold text-foreground mb-2">Create Account</h1>
          <p className="text-muted-foreground mb-8">
            Join JSR COACHING today - Get instant access to free courses!
          </p>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
              {isNetworkError ? <WifiOff className="h-5 w-5 text-destructive shrink-0 mt-0.5" /> : <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="text-sm text-destructive">{errorMessage}</p>
                {isNetworkError && (
                  <Button type="button" variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => handleSubmit()}>
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </Button>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" name="name" autoComplete="name" type="text" placeholder="Enter your full name" value={name} onChange={(e) => { setName(e.target.value); setErrorMessage(null); }} className="bg-background border-border h-12" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" name="email" autoComplete="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErrorMessage(null); }} className="bg-background border-border h-12" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="new-password"
                  autoComplete="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password (min 6 characters)"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMessage(null); }}
                  className="bg-background border-border h-12 pr-12"
                />
                <Button aria-label={showPassword ? "Hide password" : "Show password"} type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
              </div>
              {passwordCheck && (
                <div className="space-y-1.5">
                  <div className="flex gap-1 h-1.5">
                    {["weak", "fair", "strong"].map((level, i) => (
                      <div
                        key={level}
                        className={`flex-1 rounded-full transition-colors ${
                          i === 0 ? strengthColors[passwordCheck.strength] :
                          i === 1 && (passwordCheck.strength === "fair" || passwordCheck.strength === "strong") ? strengthColors[passwordCheck.strength] :
                          i === 2 && passwordCheck.strength === "strong" ? strengthColors[passwordCheck.strength] :
                          "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{passwordCheck.strength} password</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input id="confirmPassword" name="confirm-password" autoComplete="new-password" type={showPassword ? "text" : "password"} placeholder="Confirm your password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setErrorMessage(null); }} className="bg-background border-border h-12" />
            </div>

            <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground gap-2" disabled={isLoading}>
              {isLoading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Creating account...</>
              ) : (
                <><UserPlus className="h-5 w-5" /> Create Account</>
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
};

export default Signup;
