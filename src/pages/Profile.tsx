import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import { supabase } from "../integrations/supabase/client";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { User, Mail, Shield, LogOut, Phone, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ProfileAvatar from "../components/profile/ProfileAvatar";
import AvatarUploadModal from "../components/profile/AvatarUploadModal";
import { logger } from "../lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";

const Profile = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const { role, roleLoaded, refetchUserData, profile: authProfile, user: authUser } = useAuth();

  // Seed UI from the AuthContext cache so the page renders instantly — no
  // spinner flash. We still refresh from Supabase in the background to pick
  // up any out-of-band changes (e.g. avatar updated on another device).
  const initialProfile = authProfile
    ? {
        id: authProfile.id,
        email: authProfile.email,
        full_name: authProfile.fullName,
        avatar_url: authProfile.avatarUrl,
        mobile: authProfile.mobile,
      }
    : null;
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<any>(initialProfile);
  const [nameInput, setNameInput] = useState(initialProfile?.full_name ?? "");
  const [mobileInput, setMobileInput] = useState(initialProfile?.mobile ?? "");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);

  // Re-sync local UI when the AuthContext cache hydrates AFTER first render
  // (cold refresh path). Prevents the white-screen "crash" where `profile`
  // stayed null because `initialProfile` was captured before auth was ready.
  useEffect(() => {
    if (!authProfile) return;
    setProfile((prev) => prev ?? {
      id: authProfile.id,
      email: authProfile.email,
      full_name: authProfile.fullName,
      avatar_url: authProfile.avatarUrl,
      mobile: authProfile.mobile,
    });
    if (!isEditing) {
      setNameInput((n) => n || authProfile.fullName || "");
      setMobileInput((m) => m || authProfile.mobile || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authProfile?.id, authProfile?.fullName, authProfile?.avatarUrl, authProfile?.mobile]);

  // Self-profile fetch removed — AuthContext seeds the shared React Query
  // cache on every SIGNED_IN / USER_UPDATED. Any refresh path goes through
  // `refetchUserData()` (called after Save) which updates the same cache
  // and re-hydrates `authProfile` via the effect above.

  const handleSave = async () => {
    if (!profile) return;
    try {
      const { error } = await supabase
        .from('profiles').update({ full_name: nameInput, mobile: mobileInput }).eq('id', profile.id);
      if (error) throw error;
      toast.success("Profile updated");
      setProfile({ ...profile, full_name: nameInput, mobile: mobileInput });
      setIsEditing(false);
      await refetchUserData();
    } catch (error: unknown) {
      toast.error("Failed to update profile");
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Logged out successfully");
      navigate("/");
    } catch (error) {
      logger.error("Error logging out", error);
    }
  };

  // No more fullPage spinner — render immediately from the auth cache.
  // On cold refresh we may not have `profile` yet; show a lightweight
  // skeleton (header + banner) so the page never looks like a crash.
  if (!profile) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <div className="bg-primary px-4 py-4 flex items-center gap-3">
          <BackButton tone="onPrimary" />
          <h1 className="text-lg font-semibold text-primary-foreground">Profile</h1>
        </div>
        <main className="flex-1 p-4 space-y-4 pb-20 md:pb-6">
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="h-20 w-20 rounded-full bg-muted animate-pulse" />
            <div className="h-5 w-40 rounded bg-muted animate-pulse" />
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          </div>
          <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
            <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded bg-muted animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      {/* Header already renders its own spacer (see Header.tsx line 72) to
          reserve room for the fixed top bar. The extra spacer that used to
          live here caused a ~52px white strip between the header and the
          blue Profile banner on mobile — removed. */}


      <div className="bg-primary px-4 py-4 flex items-center gap-3">
        <BackButton tone="onPrimary" />
        <h1 className="text-lg font-semibold text-primary-foreground">Profile</h1>
      </div>

      <main className="flex-1 p-4 space-y-6 pb-20 md:pb-6">
        {/* Avatar Section */}
        <div className="flex flex-col items-center py-6">
          <div className="relative">
            <ProfileAvatar
              avatarUrl={profile.avatar_url}
              fullName={profile.full_name}
              userId={profile.id}
              size="md"
              onClick={() => setAvatarModalOpen(true)}
            />
            <Button
              size="icon"
              aria-label="Change profile picture"
              className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-primary hover:bg-primary/90"
              onClick={() => setAvatarModalOpen(true)}
            >
              <User className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="mt-4 text-xl font-bold text-foreground">{profile.full_name || "No Name"}</h2>
          {roleLoaded ? (
            <p className="text-sm text-muted-foreground capitalize">{role || "User"}</p>
          ) : (
            <div className="mt-1 h-3 w-16 rounded bg-muted animate-pulse" />
          )}
        </div>

        {/* Avatar Upload Modal */}
        <AvatarUploadModal
          isOpen={avatarModalOpen}
          onClose={() => setAvatarModalOpen(false)}
          userId={profile.id}
          currentAvatarUrl={profile.avatar_url}
          fullName={profile.full_name}
          onUploadComplete={(url) => {
            setProfile({ ...profile, avatar_url: url });
            void refetchUserData();
          }}
        />

        {/* Profile Info */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          <h3 className="text-lg font-semibold text-foreground">Personal Information</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" /> Full Name
              </Label>
              <Input id="name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} disabled={!isEditing} className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" /> Mobile Number
              </Label>
              <Input id="mobile" type="tel" value={mobileInput} onChange={(e) => setMobileInput(e.target.value)} disabled={!isEditing} placeholder="Enter mobile number" className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" /> Email
              </Label>
              <Input id="email" value={profile.email || ""} disabled className="bg-muted border-border" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" /> Role
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-10 px-3 py-2 rounded-md bg-muted border border-border text-sm text-muted-foreground capitalize flex items-center">
                  {roleLoaded ? (role || "member") : (
                    <span className="inline-block h-3 w-16 rounded bg-muted-foreground/20 animate-pulse" />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={async () => {
                    await refetchUserData();
                    toast.success("Role refreshed");
                  }}
                  title="Refresh role"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => { setNameInput(profile.full_name); setMobileInput(profile.mobile || ""); setIsEditing(false); }} className="flex-1">Cancel</Button>
                <Button onClick={handleSave} className="flex-1 bg-primary hover:bg-primary/90">Save Changes</Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)} variant="outline" className="w-full">Edit Profile</Button>
            )}
          </div>
        </div>


        <Button id="profile-settings" onClick={() => navigate("/settings")} variant="outline" className="w-full gap-2">
          <SettingsIcon className="h-5 w-5" /> Settings
        </Button>

        <Button onClick={handleLogout} variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground gap-2">
          <LogOut className="h-5 w-5" /> Sign Out
        </Button>
      </main>

    </div>
  );
};

export default Profile;
