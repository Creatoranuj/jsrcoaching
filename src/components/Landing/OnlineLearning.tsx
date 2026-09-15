import { memo } from "react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { ArrowRight, Clock, GraduationCap, Users } from "lucide-react";

const OnlineLearning = memo(() => (
  <section className="py-16 md:py-20 bg-background">
    <div className="container mx-auto max-w-5xl px-5 md:px-8">
      <div className="grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
            Ghar baithein board exam ki best taiyari
          </h2>
          <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
            JSR COACHING app par aapko structured schedule, recorded lectures, live doubt
            sessions aur test series milti hai — bina kisi confusion ke.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              { icon: GraduationCap, text: "Class 9–12 full syllabus coverage" },
              { icon: Clock, text: "Daily 15–30 min study plan" },
              { icon: Users, text: "Small batch, personal attention" },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm md:text-base text-foreground">
                <item.icon className="h-5 w-5 text-primary" aria-hidden />
                {item.text}
              </li>
            ))}
          </ul>
          <Link to="/courses" className="inline-block mt-8">
            <Button size="lg" className="rounded-xl font-bold gap-2">
              Courses Explore Karein <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="rounded-3xl border border-border bg-muted/30 p-8 md:p-10">
          <div className="space-y-6">
            <div className="rounded-2xl bg-card p-5 border border-border shadow-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Today&apos;s Schedule</div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Maths — Quadratic Equations</span>
                  <span className="text-muted-foreground">4:00 PM</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Science — Life Processes</span>
                  <span className="text-muted-foreground">5:00 PM</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Doubt Session</span>
                  <span className="text-muted-foreground">6:00 PM</span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-primary/5 border border-primary/10 p-5">
              <div className="text-xs uppercase tracking-wider text-primary font-medium">Upcoming Test</div>
              <div className="mt-2 text-lg font-bold text-foreground">Class 10 Maths — Full Mock</div>
              <p className="text-sm text-muted-foreground">Sunday, 10:00 AM · 60 minutes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
));

OnlineLearning.displayName = "OnlineLearning";
export default OnlineLearning;
