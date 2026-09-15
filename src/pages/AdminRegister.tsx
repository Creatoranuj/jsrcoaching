import { useState } from "react";
import { reportError } from "@/lib/sentry";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Shield, UserPlus, Loader2 } from "lucide-react";
import logoAsset from "../assets/logo.webp.asset.json";
import { getAssetUrl } from "@/lib/assetUrl";
import { getErrorMessage } from "@/lib/errorMessage";

const logo = getAssetUrl(logoAsset);

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
    <main className="min-h-dvh bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex">
      {/* Left side decoration */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-blue-600/20" />
        <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        
        <div className="relative z-10 max-w-lg text-center text-white">
          <div className="w-32 h-32 mx-auto mb-8 bg-purple-500/20 rounded-3xl flex items-center justify-center backdrop-blur-sm border border-white/10">
             <img src={logo} alt="JSR COACHING" width={80} height={80} loading="eager" decoding="async" className="h-20 w-20 rounded-xl" />
          </div>
          <h2 className="text-4xl font-bold mb-4">Join as Admin</h2>
          <p className="text-white/70 text-lg">
            Get full access to manage courses, approve payments, upload educational content, and monitor academy operations.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="flex items-center gap-3 mb-8 lg:hidden">
             <img src={logo} alt="JSR COACHING" width={48} height={48} loading="eager" decoding="async" className="h-12 w-12 rounded-xl" />
            <span className="font-bold text-2xl text-white">JSR COACHING</span>
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-purple-500/20 rounded-xl">
              <Shield className="h-8 w-8 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Admin Registration</h1>
              <p className="text-purple-300">Create your admin account</p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-white">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jsrcoachinginstitute@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12 pr-12"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-white/60 hover:text-white hover:bg-white/10"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminCode" className="text-white">Admin Authorization Code</Label>
                <Input
                  id="adminCode"
                  type="password"
                  placeholder="Enter secret admin code"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12"
                />
                <p className="text-xs text-white/50">Contact the principal to get your admin code</p>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-purple-600 hover:bg-purple-500 text-white gap-2 font-semibold mt-2"
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

            <div className="mt-6 pt-6 border-t border-white/20">
              <p className="text-center text-white/70 text-sm">
                Already have admin access?{" "}
                <Link to="/admin/login" className="text-purple-400 font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-white/50 text-sm">
            <Link to="/" className="hover:text-white">
              ← Back to Home
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
};

export default AdminRegister;
