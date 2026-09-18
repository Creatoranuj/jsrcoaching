import { useState, useEffect } from "react";
import { reportError } from "@/lib/sentry";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Shield, LogIn, Loader2 } from "lucide-react";
import logo from "../assets/branding/jsr-mark.webp";
import { getErrorMessage } from "@/lib/errorMessage";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Check if already logged in as admin
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: isAdmin } = await supabase.rpc('has_role', {
          _user_id: session.user.id,
          _role: 'admin',
        });
        if (isAdmin) navigate('/admin/upload');
      }
    };
    checkSession();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) { toast.error("Please fill in all fields"); return; }
    if (!navigator.onLine) { toast.error("You appear to be offline."); return; }

    try {
      setIsLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) { toast.error(error.message); return; }

      // Check admin role via security-definer RPC
      const { data: isAdminRole, error: roleError } = await supabase.rpc('has_role', {
        _user_id: data.user.id,
        _role: 'admin',
      });

      if (roleError) reportError(roleError, { surface: "AdminLogin.roleCheck" });

      if (!isAdminRole) {
        toast.error("Access denied. Admin role not found.");
        await supabase.auth.signOut();
        return;
      }

      toast.success("Welcome, admin");
      navigate('/admin/upload', { replace: true });

    } catch (err: unknown) {
      toast.error("Login ruk gaya — dobara try karo");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-ink flex">
      <div className="flex-1 flex flex-col justify-center px-8 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="flex items-center gap-3 mb-8">
            <img src={logo} alt="JSR COACHING" width={48} height={48} loading="eager" decoding="async" className="h-12 w-12 rounded-xl" />
            <span className="font-bold text-2xl text-ink-foreground">JSR COACHING</span>
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-gold/15 rounded-xl">
              <Shield className="h-8 w-8 text-gold" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-ink-foreground">Admin Portal</h1>
              <p className="text-ink-foreground/70">Secure access for administrators</p>
            </div>
          </div>

          <div className="bg-ink-foreground/10 backdrop-blur-lg rounded-2xl p-8 border border-ink-foreground/20">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-ink-foreground">Admin Email</Label>
                <Input id="email" type="email" placeholder="jsrcoachinginstitute@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-ink-foreground/10 border-ink-foreground/20 text-ink-foreground placeholder:text-ink-foreground/50 h-12" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-ink-foreground">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-ink-foreground/10 border-ink-foreground/20 text-ink-foreground placeholder:text-ink-foreground/50 h-12 pr-12" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 text-ink-foreground/60 hover:text-ink-foreground hover:bg-ink-foreground/10" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 font-semibold" disabled={isLoading}>
                {isLoading ? (<><Loader2 className="h-5 w-5 animate-spin" />Authenticating...</>) : (<><LogIn className="h-5 w-5" />Sign In to Admin</>)}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-ink-foreground/20">
              <p className="text-center text-ink-foreground/50 text-xs">Admin access is restricted to authorized personnel only.</p>
            </div>
          </div>

          <p className="mt-6 text-center text-ink-foreground/50 text-sm">
            <Link to="/login" className="hover:text-ink-foreground">← Back to Student Login</Link>
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-gold/10" />
        <div className="absolute top-20 right-20 w-72 h-72 bg-primary/25 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-gold/15 rounded-full blur-3xl" />
        <div className="relative z-10 max-w-lg text-center text-ink-foreground">
          <Shield className="h-24 w-24 mx-auto mb-8 text-gold" />
          <h2 className="text-4xl font-bold mb-4">Admin Control Center</h2>
          <p className="text-ink-foreground/70 text-lg">Manage courses, approve payments, upload content, and monitor student progress.</p>
        </div>
      </div>
    </main>
  );
};

export default AdminLogin;
