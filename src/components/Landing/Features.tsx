import { memo } from "react";
import { BookOpen, MonitorPlay, ClipboardCheck, MessageCircleQuestion } from "lucide-react";

const features = [
  {
    icon: MonitorPlay,
    title: "Live + Recorded Classes",
    desc: "Har chapter live samjhaaya jaata hai aur recording 24x7 available rehti hai.",
  },
  {
    icon: BookOpen,
    title: "Hindi-Medium Notes",
    desc: "Board exam ke important points ko simple Hindi mein notes ke roop mein diya jaata hai.",
  },
  {
    icon: ClipboardCheck,
    title: "Weekly Tests & Analysis",
    desc: "Har hafte test, detailed scorecard aur weak topics ki report — improvement clear dikhta hai.",
  },
  {
    icon: MessageCircleQuestion,
    title: "Doubt Clearing Classes",
    desc: "Apne sawal poochhein — direct mentor se answer milta hai, group mein nahi atakna padta.",
  },
];

const Features = memo(() => (
  <section className="py-16 md:py-20 bg-muted/30">
    <div className="container mx-auto max-w-5xl px-5 md:px-8">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
          Board Exam Prep, Simplified
        </h2>
        <p className="mt-3 text-base md:text-lg text-muted-foreground">
          Har student ko chahiye clarity, practice aur confidence — ye teeno yahan milti hain.
        </p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm flex gap-4"
          >
            <span className="h-12 w-12 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <f.icon className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="font-bold text-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
));

Features.displayName = "Features";
export default Features;
