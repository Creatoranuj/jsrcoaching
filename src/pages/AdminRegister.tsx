import { useState } from "react";
import { reportError } from "@/lib/sentry";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Shield, UserPlus, Loader2 } from "lucide-react";
import logo from "../assets/branding/jsr-mark.webp";
import { getErrorMessage } from "@/lib/errorMessage";


const AdminRegister = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!name || !email || !password || !confirmPassword || !adminCode) {
      toast.error("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 10) {
      toast.error("Admin password must be at least 10 characters");
      return;
    }

    try {
      setIsLoading(true);

      // Admin accounts are created server-side only, gated by the secret admin code.
      const { data, error } = await supabase.functions.invoke("admin-register", {
        body: {
          email: email.trim(),
          password,
          full_name: name.trim(),
          admin_code: adminCode,
        },
      });

      if (error) throw error;

      if (!data?.success) {
        toast.error(data?.error || "Failed to create admin account");
        return;
      }

      toast.success("Admin account created. Please sign in.");
      navigate("/admin/login", { replace: true });

    } catch (error: unknown) {
      reportError(error, { surface: "AdminRegister.submit" });
      toast.error(getErrorMessage(error) || "Failed to create admin account");
    } finally {

      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-ink flex">
      {/* Left side decoration */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-gold/10" />
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary/25 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-gold/15 rounded-full blur-3xl" />
        
        <div className="relative z-10 max-w-lg text-center text-ink-foreground">
          <div className="w-32 h-32 mx-auto mb-8 bg-gold/15 rounded-3xl flex items-center justify-center backdrop-blur-sm border border-white/10">
             <img src={logo} alt="JSR COACHING" width={80} height={80} loading="eager" decoding="async" className="h-20 w-20 rounded-xl" />
          </div>
          <h2 className="text-4xl font-bold mb-4">Join as Admin</h2>
          <p className="text-ink-foreground/70 text-lg">
            Get full access to manage courses, approve payments, upload educational content, and monitor academy operations.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="flex items-center gap-3 mb-8 lg:hidden">
             <img src={logo} alt="JSR COACHING" width={48} height={48} loading="eager" decoding="async" className="h-12 w-12 rounded-xl" />
            <span className="font-bold text-2xl text-ink-foreground">JSR COACHING</span>
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-gold/15 rounded-xl">
              <Shield className="h-8 w-8 text-gold" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-ink-foreground">Admin Registration</h1>
              <p className="text-ink-foreground/70">Create your admin account</p>
            </div>
          </div>

          <div className="bg-ink-foreground/10 backdrop-blur-lg rounded-2xl p-8 border border-ink-foreground/20">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-ink-foreground">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-ink-foreground/10 border-ink-foreground/20 text-ink-foreground placeholder:text-ink-foreground/50 h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-ink-foreground">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jsrcoachinginstitute@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-ink-foreground/10 border-ink-foreground/20 text-ink-foreground placeholder:text-ink-foreground/50 h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-ink-foreground">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-ink-foreground/10 border-ink-foreground/20 text-ink-foreground placeholder:text-ink-foreground/50 h-12 pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-ink-foreground/60 hover:text-ink-foreground hover:bg-ink-foreground/10"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-ink-foreground">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-ink-foreground/10 border-ink-foreground/20 text-ink-foreground placeholder:text-ink-foreground/50 h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminCode" className="text-ink-foreground">Admin Authorization Code</Label>
                <Input
                  id="adminCode"
                  type="password"
                  placeholder="Enter secret admin code"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  className="bg-ink-foreground/10 border-ink-foreground/20 text-ink-foreground placeholder:text-ink-foreground/50 h-12"
                />
                <p className="text-xs text-ink-foreground/50">Contact the principal to get your admin code</p>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 font-semibold mt-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-5 w-5" />
                    Create Admin Account
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-ink-foreground/20">
              <p className="text-center text-ink-foreground/70 text-sm">
                Already have admin access?{" "}
                <Link to="/admin/login" className="text-gold font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-ink-foreground/50 text-sm">
            <Link to="/" className="hover:text-ink-foreground">
              ← Back to Home
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
};

export default AdminRegister;
