import { memo } from "react";
import { Link } from "react-router-dom";
import { BookOpen, PenLine, GraduationCap, Calculator, FlaskConical } from "lucide-react";

const streams = [
  { icon: GraduationCap, label: "Class 9–10", tint: "bg-primary/10 text-primary" },
  { icon: BookOpen, label: "Class 11–12", tint: "bg-violet-500/10 text-violet-600" },
  { icon: PenLine, label: "English & Writing", tint: "bg-amber-500/10 text-amber-600" },
  { icon: Calculator, label: "Maths Practice", tint: "bg-emerald-500/10 text-emerald-600" },
  { icon: FlaskConical, label: "Science Revision", tint: "bg-sky-500/10 text-sky-600" },
];

const StreamsWeOffer = memo(() => (
  <section aria-label="Streams we offer" className="py-16 md:py-20 bg-muted/30">
    <div className="container mx-auto max-w-5xl px-5 md:px-8">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
          Streams We Offer
        </h2>
        <p className="mt-3 text-base md:text-lg text-muted-foreground">
          Board exams ke liye har subject ki poori taiyari — ek hi platform par.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {streams.map(({ icon: Icon, label, tint }) => (
          <Link
            key={label}
            to="/courses"
            className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <span className={`h-14 w-14 rounded-full flex items-center justify-center ${tint}`}>
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-sm font-bold text-foreground text-center">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  </section>
));

StreamsWeOffer.displayName = "StreamsWeOffer";
export default StreamsWeOffer;
