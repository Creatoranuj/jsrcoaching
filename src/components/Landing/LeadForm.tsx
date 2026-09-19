import { useState, memo, useCallback } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { tapHaptic } from "@/lib/native/haptics";
import { logger } from "@/lib/logger";

const grades = ["9", "10", "11", "12"];

const LeadForm = memo(() => {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [grade, setGrade] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !email.trim() || !grade) {
        toast.error("Sab fields bharein");
        return;
      }
      setLoading(true);
      try {
        const { error } = await supabase.from("leads").insert({
          student_name: name.trim(),
          email: email.trim(),
          grade,
          user_id: user?.id ?? null,
        });
        if (error) throw error;
        toast.success("Shukriya! Hamari team jaldi contact karegi.");
        setName("");
        setEmail("");
        setGrade("");
      } catch (err) {
        toast.error("Kuchh galat ho gaya. Dobara koshish karein.");
        logger.error("lead form submit failed", err);
      } finally {
        setLoading(false);
      }
    },
    [name, email, grade, user]
  );

  return (
    <section className="py-16 md:py-20 bg-muted/30 border-y border-border/60">
      <div className="container mx-auto max-w-5xl px-5 md:px-8">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
              Free counselling session book karein
            </h2>
            <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
              Class 9–12 — shuruaat aaj karein. Hamari team aapko board exam strategy, schedule aur
              course fit batayegi.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">• Free 15-minute strategy call</li>
              <li className="flex items-center gap-2">• Personal study plan</li>
              <li className="flex items-center gap-2">• Fee structure aur batches ki jaankari</li>
            </ul>
          </div>

          <form
            onSubmit={submit}
            className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-5"
          >
            <div>
              <Label htmlFor="lead-name">Student ka naam</Label>
              <Input
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aapka naam"
                required
              />
            </div>
            <div>
              <Label htmlFor="lead-email">Email</Label>
              <Input
                id="lead-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aapka@email.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="lead-grade">Class</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger id="lead-grade">
                  <SelectValue placeholder="Class chunein" />
                </SelectTrigger>
                <SelectContent>
                  {grades.map((g) => (
                    <SelectItem key={g} value={g}>Class {g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              onClick={() => void tapHaptic("light")}
            >
              {loading ? "Bhej rahe hain..." : "Free counselling book karein"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Submit karne se aap hamari privacy policy se sahmat hain.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
});

LeadForm.displayName = "LeadForm";
export default LeadForm;
