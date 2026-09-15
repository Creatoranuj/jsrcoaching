/**
 * Settings.tsx
 * =============
 * User settings and preferences page.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { useAuth } from "../contexts/AuthContext";
import { leakedPasswordError } from "../lib/leakedPassword";
import { useTheme } from "../contexts/ThemeContext";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";
import { 
  Bell, Moon, Lock, Shield, 
  Monitor, Smartphone, Trash2, LogOut, Save,
  RefreshCw, WifiOff
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";

// Per-device session identifier (NOT an auth JWT — Supabase manages its own token).
// Used by the "manage devices" feature to identify this browser/APK install.
const NB_DEVICE_SESSION_ID_KEY = "nb_device_session_id";
// Back-compat: previous builds wrote to `sg_session_token`. Read either.
const LEGACY_DEVICE_SESSION_ID_KEY = "sg_session_token";

interface SessionRow {
  id: string;
  device_type: "web" | "mobile";
  user_agent: string | null;
  last_active_at: string;
  logged_in_at: string;
  is_active: boolean;
}

const Settings = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, profile, user, logout, isLoading: authLoading } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  
  // Settings state
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Change password dialog
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Account deletion (Apple/Google compliance)
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [terminatingToken, setTerminatingToken] = useState<string | null>(null);

  const currentToken =
    localStorage.getItem(NB_DEVICE_SESSION_ID_KEY) ||
    localStorage.getItem(LEGACY_DEVICE_SESSION_ID_KEY);

  // Load preferences from Supabase
  const fetchPreferences = useCallback(async () => {
    if (!user) return;
    setPrefsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data) {
        setEmailNotifications(data.email_notifications);
        setPushNotifications(data.push_notifications);
      }
      // If no row exists, defaults (true/true) are fine
    } catch (err) {
      logger.error("Error fetching preferences:", err);
    } finally {
      setPrefsLoading(false);
    }
  }, [user]);

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    setSessionsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("id, device_type, user_agent, last_active_at, logged_in_at, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("logged_in_at", { ascending: false });

      if (!error && data) setSessions(data as SessionRow[]);
    } finally {
      setSessionsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchSessions();
      fetchPreferences();
    }
  }, [isAuthenticated, user, fetchSessions, fetchPreferences]);

  const handleSaveSettings = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          email_notifications: emailNotifications,
          push_notifications: pushNotifications,
        }, { onConflict: "user_id" });

      if (error) throw error;
      toast.success("Settings saved!");
    } catch (err: unknown) {
      logger.error("Error saving preferences:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      const breached = await leakedPasswordError(newPassword);
      if (breached) {
        toast.error(breached);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password changed");
      setShowPasswordDialog(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleTerminateSession = async (sessionToken: string) => {
    if (sessionToken === currentToken) return;
    setTerminatingToken(sessionToken);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // supabase.functions.invoke works in the native APK (no Express proxy
      // is bundled with the Capacitor build).
      const { error } = await supabase.functions.invoke("manage-session", {
        body: { action: "terminate", session_id: sessionToken },
      });

      if (!error) {
        toast.success("Session terminated");
        setSessions(prev => prev.filter(s => s.id !== sessionToken));
      } else {
        toast.error("Failed to terminate session");
      }
    } finally {
      setTerminatingToken(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleDeleteAccount = () => {
    setShowDeleteAlert(true);
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data: _delData, error: _delErr } = await supabase.functions.invoke("request-account-deletion", {
        body: {},
      });

      if (_delErr || _delData?.error) {
        const status = (_delErr as any)?.context?.status as number | undefined;
        let message = "Kuch ruk gaya — dobara try karo";
        if (status === 401) message = "Please sign in again to continue.";
        else if (status === 409) message = "A deletion request is already pending for your account.";
        else if (_delData?.error) message = _delData.error;
        else if (_delErr?.message) message = _delErr.message;
        toast.error(message);
        return;
      }

      toast.success("Your deletion request has been submitted. You will receive an email within 7 days.");
    } catch (err) {
      logger.error("Account deletion request failed:", err);
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  };

  if (!authLoading && !isAuthenticated) {
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      {/* Page Header */}
      <div className="bg-primary px-4 py-4 flex items-center gap-3">
        <BackButton tone="onPrimary" />
        <h1 className="text-lg font-semibold text-primary-foreground">Settings</h1>
      </div>

      <main className="flex-1 p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>Manage how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="email-notifications" className="flex-1">
                <div className="font-medium">Email Notifications</div>
                <div className="text-sm text-muted-foreground">Receive updates via email</div>
              </Label>
              <Switch
                id="email-notifications"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
                disabled={prefsLoading}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="push-notifications" className="flex-1">
                <div className="font-medium">Push Notifications</div>
                <div className="text-sm text-muted-foreground">Receive browser notifications</div>
              </Label>
              <Switch
                id="push-notifications"
                checked={pushNotifications}
                onCheckedChange={setPushNotifications}
                disabled={prefsLoading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Moon className="h-5 w-5 text-primary" />
              Appearance
            </CardTitle>
            <CardDescription>Customize how the app looks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="dark-mode" className="flex-1">
                <div className="font-medium">Dark Mode</div>
                <div className="text-sm text-muted-foreground">Use dark theme</div>
              </Label>
              <Switch
                id="dark-mode"
                checked={isDarkMode}
                onCheckedChange={toggleTheme}
              />
            </div>
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5 text-primary" />
                  Active Sessions
                </CardTitle>
                <CardDescription>Devices currently logged into your account (max 2)</CardDescription>
              </div>
              <Button aria-label="Refresh sessions" variant="ghost" size="icon" onClick={fetchSessions} disabled={sessionsLoading}>
                <RefreshCw className={`h-4 w-4 ${sessionsLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                <WifiOff className="h-8 w-8" />
                <p className="text-sm">No active sessions found</p>
                <p className="text-xs">Sessions are tracked when you log in via the app</p>
              </div>
            ) : (
              sessions.map((s) => {
                const isCurrent = s.id === currentToken;
                return (
                  <div
                    key={s.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${isCurrent ? "border-primary/30 bg-primary/5" : "border-border"}`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${s.device_type === "mobile" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                      {s.device_type === "mobile" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm capitalize">{s.device_type}</span>
                        {isCurrent && <Badge className="text-xs bg-primary/10 text-primary border-primary/20">This device</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {s.user_agent ? s.user_agent.substring(0, 60) + "..." : "Unknown browser"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Last active {formatDistanceToNow(new Date(s.last_active_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-destructive border-destructive/20 hover:bg-destructive/10"
                        onClick={() => handleTerminateSession(s.id)}
                        disabled={terminatingToken === s.id}
                      >
                        {terminatingToken === s.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <LogOut className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 mt-2">
              <strong>Session Limit Policy:</strong> Each account can be used on up to 2 devices simultaneously. If you log in from a third device, your oldest session will be automatically signed out.
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" />
              Security
            </CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => setShowPasswordDialog(true)}
            >
              <Lock className="h-4 w-4" />
              Change Password
            </Button>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
            <CardDescription>Manage your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2 text-destructive border-destructive/20 hover:bg-destructive/10"
              onClick={handleDeleteAccount}
            >
              <Trash2 className="h-4 w-4" />
              Delete Account
            </Button>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button className="w-full" onClick={handleSaveSettings} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </main>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Enter your new password below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
            <Button onClick={handleChangePassword} disabled={changingPassword}>
              {changingPassword ? "Changing..." : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account-deletion confirm */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? Your data deletion request will be processed within 7 business days. You will receive a confirmation email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void confirmDeleteAccount(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Submitting..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
