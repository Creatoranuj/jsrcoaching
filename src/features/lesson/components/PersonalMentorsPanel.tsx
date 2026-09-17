import { Mail, Phone, Users } from "lucide-react";
import { FOUNDER_NAME, FOUNDER_INITIALS } from "@/config/faculty";

export interface MentorInfo {
  name: string;
  role: string;
  phone: string;
  email: string;
  initials: string;
}

export const PERSONAL_MENTORS: MentorInfo[] = [
  { name: FOUNDER_NAME, role: "Founder & Lead Mentor", phone: "+91 73884 59249", email: "jsrcoachinginstitute@gmail.com", initials: FOUNDER_INITIALS },
  { name: "Priya Ma'am", role: "Spoken English Mentor", phone: "+91 73884 59249", email: "jsrcoachinginstitute@gmail.com", initials: "PM" },
  { name: "Rahul Sir", role: "Grammar Mentor", phone: "+91 73884 59249", email: "jsrcoachinginstitute@gmail.com", initials: "RS" },
  { name: "Anjali Ma'am", role: "CG Lecturer Prep Mentor", phone: "+91 73884 59249", email: "jsrcoachinginstitute@gmail.com", initials: "AM" },
];

export function PersonalMentorsPanel() {
  return (
    <div className="px-4 py-4 space-y-4">
      <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        Personal Mentors
      </h3>
      <p className="text-sm text-muted-foreground">
        Aapke liye dedicated mentors — direct guidance ke liye contact karein.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PERSONAL_MENTORS.map((m) => (
          <div key={m.name} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20">
            <div className="h-11 w-11 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
              {m.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-foreground">{m.name}</div>
              <div className="text-xs text-muted-foreground mb-2">{m.role}</div>
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${m.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Phone className="h-3 w-3" /> Call
                </a>
                <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Mail className="h-3 w-3" /> Email
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
