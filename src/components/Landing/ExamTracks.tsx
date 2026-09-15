import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Clock, Languages, Users } from "lucide-react";
import { useLandingCourses } from "@/hooks/useLandingCourses";
import CountdownPill from "./CountdownPill";
import { tapHaptic, selectionHaptic } from "@/lib/native/haptics";

const ribbonFor = (label: string): string => {
  const s = label.toLowerCase();
  if (s.includes("up")) return "from-indigo-500 to-blue-500";
  if (s.includes("cbse")) return "from-emerald-500 to-teal-500";
  if (s.includes("class 9") || s.includes("class 10")) return "from-primary to-accent";
  if (s.includes("class 11") || s.includes("class 12")) return "from-violet-500 to-purple-500";
  return "from-primary to-accent";
};

const ExamTracks = memo(() => {
  const { data: allTracks = [], isLoading } = useLandingCourses();

  // Hide legacy CG Lecturer / Spoken English tracks from the Board Exam homepage.
  const tracks = allTracks.filter((t) => {
    const label = `${t.badge} ${t.title}`.toLowerCase();
    return !label.includes("spoken") && !label.includes("cg-lecturer") && !label.includes("cg lecturer");
  });

  return (
    <section className="py-20 md:py-28 bg-background">
      <div className="container mx-auto max-w-5xl px-5 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
              Featured Board Exam Batches
            </h2>
            <p className="mt-3 text-base md:text-lg text-muted-foreground">
              Class 9–12 ke liye curated courses — live classes, notes aur tests ke saath.
            </p>
          </div>
          <Link
            to="/courses"
            onClick={() => void tapHaptic("light")}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Sab courses dekhein <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">Abhi koi board exam batch available nahi hai.</p>
            <Link to="/courses" className="mt-4 inline-block text-primary font-medium hover:underline">
              Courses page par jaayein
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {tracks.map((track) => (
              <Link
                key={track.id}
                to={`/buy-course/${track.id}`}
                onClick={() => void selectionHaptic()}
                className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
              >
                <div className={`h-2 w-full bg-gradient-to-r ${ribbonFor(track.badge)}`} />
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary">
                      {track.badge}
                    </span>
                    <CountdownPill startDate={track.start_date} />
                  </div>

                  <h3 className="mt-4 text-lg font-bold text-foreground line-clamp-2">{track.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{track.short}</p>

                  <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {track.duration && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        {track.duration}
                      </span>
                    )}
                    {track.start_date && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                        {track.start_date}
                      </span>
                    )}
                    {track.language && (
                      <span className="inline-flex items-center gap-1">
                        <Languages className="h-3.5 w-3.5" aria-hidden />
                        {track.language}
                      </span>
                    )}
                    {track.seats && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {track.seats}
                      </span>
                    )}
                  </div>

                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-lg font-extrabold text-foreground">
                      ₹{track.price_effective ?? track.price_mrp}
                    </span>
                    {track.price_mrp != null &&
                      track.price_effective != null &&
                      track.price_effective < track.price_mrp && (
                        <span className="text-sm text-muted-foreground line-through">₹{track.price_mrp}</span>
                      )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <span className="text-sm font-medium text-primary group-hover:underline">
                      Enroll karein
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
});

ExamTracks.displayName = "ExamTracks";
export default ExamTracks;
