import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

const featured = [
  {
    tag: "Class 10 · All Subjects",
    title: "Class 10 Board Exam — Complete Prep",
    instructor: "Pankaj Sir",
    duration: "Full syllabus · revision + mocks",
  },
  {
    tag: "Class 12 · English",
    title: "Board English — Grammar & Writing",
    instructor: "Pankaj Sir",
    duration: "10 weeks · 72 lessons",
  },
  {
    tag: "Class 9–11 · Foundation",
    title: "Class 9–11 Strong Foundation Batch",
    instructor: "JSR COACHING Faculty",
    duration: "12 weeks · 90 lessons",
  },
];

const Subjects = memo(() => (
  <section className="py-20 md:py-28 bg-background border-b border-border/60">
    <div className="container mx-auto max-w-7xl px-6 lg:px-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium mb-3">Featured</p>
          <h2
            className="font-serif text-4xl md:text-5xl text-foreground leading-[1.1]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Class 9–12 Board Exam ki taiyari — ek jagah.
          </h2>
        </div>
        <Link
          to="/courses"
          className="text-sm font-medium text-foreground hover:text-accent transition-colors inline-flex items-center gap-1 self-start md:self-auto"
        >
          Browse all courses <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-px bg-border">
        {featured.map((c, i) => (
          <Link
            key={i}
            to="/courses"
            className="group bg-background p-7 md:p-8 flex flex-col gap-4 hover:bg-muted/40 transition-colors"
          >
            <div className="aspect-[4/3] bg-muted rounded-sm overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-accent/10 to-transparent" />
              <div className="absolute bottom-3 left-3 text-xs font-medium uppercase tracking-wider text-foreground/80 bg-background/90 px-2 py-1 rounded-sm">
                {c.tag}
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <h3
                className="font-serif text-xl md:text-2xl text-foreground leading-snug group-hover:text-accent transition-colors"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {c.title}
              </h3>
              <p className="text-sm text-muted-foreground">{c.instructor}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground/80 pt-1">{c.duration}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  </section>
));

Subjects.displayName = "Subjects";
export default Subjects;
