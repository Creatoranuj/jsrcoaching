import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, LogIn, AlertCircle, WifiOff, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import logo from "../assets/branding/jsr-mark.webp";
import { tapHaptic } from "@/lib/native/haptics";
import { validateEmailDomain } from "../lib/emailBlocklist";
import { getNetworkStatus } from "@/lib/native/network";
import { getErrorMessage } from "@/lib/errorMessage";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  // Navigate when authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      toast.success("Welcome back!");
      const destination = location.state?.from || "/dashboard";
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, location.state]);

  // Student paid in the phone's browser and got bounced here. Say so, loudly
  // and calmly — a bare login form after a debit is what makes people panic
  // and pay twice.
  const returningFromPayment = String(
    (location.state as { from?: string } | null)?.from ?? "",
  ).startsWith("/payment-callback");

  const mapError = (msg: string): string => {
    const lower = msg.toLowerCase();
    if (lower.includes("email not confirmed")) return "Please verify your email before signing in. Check your inbox.";
    if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials") || lower.includes("invalid email or password")) return "Invalid email or password.";
    if (lower.includes("too many requests")) return "Too many attempts. Please wait a moment.";
    if (lower.includes("abort") || lower.includes("timeout") || lower.includes("timed out")) return "Connection timed out. Your internet may be slow — please try again.";
    if (lower.includes("fetch") || lower.includes("network") || lower.includes("failed to fetch") || lower.includes("err_connection")) return "Network error — check your internet connection and try again.";
    return msg || "Login failed. Please try again.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    void tapHaptic("light");
    setErrorMessage(null);
    setIsNetworkError(false);

    if (!email || !password) { setErrorMessage("Please fill in all fields"); return; }
    // Capacitor-aware net check — `navigator.onLine` lies through captive portals.
    try {
      const { connected } = await getNetworkStatus();
      if (!connected) {
        setErrorMessage("You appear to be offline. Please check your internet connection.");
        setIsNetworkError(true);
        return;
      }
    } catch {
      if (!navigator.onLine) {
        setErrorMessage("You appear to be offline. Please check your internet connection.");
        setIsNetworkError(true);
        return;
      }
    }

    const emailError = validateEmailDomain(email.trim());
    if (emailError) { setErrorMessage(emailError); return; }

    try {
      setIsLoading(true);

      const { error } = await login(email.trim(), password);

      if (error) {
        const errorMsg = mapError(error.message || "");
        const isNetwork = /network|fetch|timeout|abort|timed|connection/i.test(error.message || "");
        setErrorMessage(errorMsg);
        setIsNetworkError(isNetwork);
        return;
      }

      // Login succeeded — onAuthStateChange will update isAuthenticated and the useEffect above will navigate
    } catch (err: unknown) {
      const errorMsg = mapError(getErrorMessage(err) || "Login ruk gaya — dobara try karo");
      const isNetwork = /network|fetch|timeout|abort|timed|connection/i.test(getErrorMessage(err) || "");
      setErrorMessage(errorMsg);
      setIsNetworkError(isNetwork);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-background flex">
      <div className="flex-1 flex flex-col justify-center px-5 sm:px-8 py-8 sm:py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="flex items-center gap-3 mb-8">
            <img src={logo} alt="JSR COACHING" className="h-14 w-14 rounded-full object-contain" width={56} height={56} />
            <span className="font-bold text-2xl text-foreground">JSR COACHING</span>
          </Link>

          <h1 className="text-3xl font-bold text-foreground mb-2">Welcome Back</h1>
          <p className="text-muted-foreground mb-8">Sign in to access your courses</p>

          {returningFromPayment && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 flex items-start gap-2 dark:bg-green-950/30 dark:border-green-900">
              <ShieldCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <p className="text-sm text-green-800 dark:text-green-300">
                Payment mil gaya &#10003; Aapka paisa surakshit hai. Login karte hi course
                apne aap khul jayega &#8212; dobara pay mat kijiye.
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
              {isNetworkError ? <WifiOff className="h-5 w-5 text-destructive shrink-0 mt-0.5" /> : <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="text-sm text-destructive">{errorMessage}</p>
                {isNetworkError && (
                  <Button type="button" variant="outline" size="sm" className="mt-2 gap-1.5" onClick={handleSubmit}>
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </Button>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" data-testid="login-email" aria-label="Email Address" name="email" autoComplete="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErrorMessage(null); }} className="bg-background border-border h-12" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <Input id="password" data-testid="login-password" aria-label="Password" name="password" autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => { setPassword(e.target.value); setErrorMessage(null); }} className="bg-background border-border h-12 pr-12" />
                <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
              </div>
            </div>

            <Button id="login-submit" data-testid="login-submit" aria-label="Sign In" type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 active:scale-[0.98] transition-transform duration-150 ease-out" disabled={isLoading}>
              {isLoading ? "Signing in..." : <><LogIn className="h-5 w-5" /> Sign In</>}
            </Button>
          </form>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {/* SMS OTP is under construction (see PhoneLogin). Say so up front and
              use a lucide glyph — the 📱 emoji renders as a tofu box on the
              stock Android WebView font. */}
          <Link to="/login-otp" state={location.state} className="mt-4 block">
            <Button type="button" variant="outline" className="w-full h-12 gap-2">
              <Smartphone className="h-4 w-4" aria-hidden="true" />
              Mobile OTP — temporarily unavailable
            </Button>
          </Link>

          <p className="mt-8 text-center text-muted-foreground">
            Don't have an account? <Link to="/signup" state={location.state} className="text-primary font-medium hover:underline">Create account</Link>
          </p>
        </div>
      </div>
      
      <div className="hidden lg:flex flex-1 bg-primary items-center justify-center p-12">
        <div className="max-w-lg text-center text-primary-foreground">
          <h2 className="text-3xl font-bold mb-4">Roz ka English, tumhaari raftaar pe</h2>
          <p className="text-primary-foreground/80 text-lg">JSR COACHING pe wapas swagat hai.</p>
        </div>
      </div>
    </main>
  );
};

export default Login;
