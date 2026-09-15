import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errorMessage";

const DeleteAccountPublic = () => {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      // Public request — edge function handles email verification via OTP/email link.
      // Uses supabase.functions.invoke so it works in the native APK build.
      const { data, error } = await supabase.functions.invoke("request-account-deletion", {
        body: { email, reason, public_request: true },
      });
      if (error) throw new Error(error.message || "Request failed");
      if (data?.error) throw new Error(data.error);
      setSubmitted(true);
      toast.success("Request received. Check your email to confirm.");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) ?? "Could not submit request. Please email jsrcoachinginstitute@gmail.com");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-background py-12 px-4">
      <div className="max-w-xl mx-auto">
        <Link to="/" className="text-primary hover:underline text-sm">← Back to Home</Link>
        <Card className="p-8 mt-4">
          <h1 className="text-2xl font-bold mb-2">Delete Your Account</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Use this form if you cannot sign in. Logged-in users can delete instantly from{" "}
            <Link to="/settings" className="text-primary hover:underline">Settings</Link>.
          </p>

          {submitted ? (
            <div className="space-y-4">
              <p className="text-sm">
                We've received your deletion request for <strong>{email}</strong>. You will get a
                confirmation email within 24 hours. Once you confirm, all personal data
                (profile, enrollments, progress, notes, payment history) is permanently removed
                within 7 days.
              </p>
              <p className="text-xs text-muted-foreground">
                Anonymized analytics may be retained for service improvement. Refunds for active
                subscriptions are handled per our refund policy.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email address on the account</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Help us improve…"
                  rows={3}
                />
              </div>
              <div className="text-xs text-muted-foreground space-y-1 border rounded-md p-3 bg-muted/40">
                <p><strong>What gets deleted:</strong> profile, enrolled courses, progress, quiz attempts, notes, doubts, messages, attendance records, payment history.</p>
                <p><strong>Timeline:</strong> within 7 days of email confirmation.</p>
              </div>
              <Button type="submit" variant="destructive" disabled={submitting} className="w-full">
                {submitting ? "Submitting…" : "Request Account Deletion"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
};

export default DeleteAccountPublic;
