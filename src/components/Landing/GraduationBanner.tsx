import { memo } from "react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { ArrowRight } from "lucide-react";
import { usePlatformStats } from "../../hooks/usePlatformStats";

const GraduationBanner = memo(() => {
  const { stats } = usePlatformStats();
  const learners = stats.total_students >= 1000
    ? `${Math.floor(stats.total_students / 1000)}k+`
    : `${Math.max(stats.total_students, 100)}+`;

  return (
    <section className="border-y border-border/60 bg-muted/30 py-14 md:py-16">
      <div className="container mx-auto max-w-3xl px-6 text-center">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium">
            Join our learners
          </p>
          <h2 className="font-serif text-3xl md:text-4xl text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
            {learners} students already learning with JSR COACHING.
          </h2>
          <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
            Board exam prep ke liye aaj signup karein aur pehla lesson free dekhein.
          </p>
          <Link to="/signup">
            <Button size="lg" className="gap-2 mt-2">
              Free signup <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
});

GraduationBanner.displayName = "GraduationBanner";
export default GraduationBanner;
