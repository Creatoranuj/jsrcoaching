import { memo } from "react";
import { Button } from "../ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { tapHaptic } from "@/lib/native/haptics";
import Picture from "../ui/Picture";
import heroImage from "../../assets/landing/hero-classroom.jpg";
import heroImageWebp from "../../assets/landing/hero-classroom.webp";
import heroImageAvif from "../../assets/landing/hero-classroom.avif";

export interface HeroData {
  title: string;
  subtitle: string;
  cta_text: string;
}

export interface HeroStat {
  stat_key: string;
  stat_value: string;
}

interface HeroProps {
  data: HeroData | null;
  stats?: HeroStat[];
}

const statLabels: Record<string, string> = {
  students: "Students",
  courses: "Courses",
  teachers: "Teachers",
};

const Hero = memo(({ data, stats = [] }: HeroProps) => {
  const shown = stats.filter((s) => statLabels[s.stat_key]).slice(0, 2);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary/[0.06] via-background to-background">
      <div className="container mx-auto max-w-5xl px-5 md:px-8 pt-10 pb-14 md:pt-16 md:pb-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" aria-hidden />
          Class 9–12 | Board Exam Focus
        </span>

        <h1 className="mt-6 text-4xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.08]">
          {data?.title || "Board Exam Ki Taiyari, Ab Puri Strategy Ke Saath."}
        </h1>

        <p className="mt-5 text-lg md:text-xl font-semibold text-foreground/80 max-w-2xl mx-auto">
          Hindi medium students ke liye India ka sabse affordable board exam prep platform.
        </p>

        <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {data?.subtitle ||
            "Class 9–12 ke liye chapter-wise lessons, revision notes, practice papers aur regular tests — Hindi mein simple explanation ke saath."}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/courses" onClick={() => { void tapHaptic("light"); }} className="sm:w-auto">
            <Button
              size="lg"
              className="h-13 w-full sm:w-auto px-10 rounded-xl text-base font-bold gap-2 active:scale-[0.97] transition-transform duration-150"
            >
              {data?.cta_text || "Board Courses Dekhein"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {shown.length > 0 && (
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {shown.map((s) => (
              <div
                key={s.stat_key}
                className="min-w-[8.5rem] rounded-2xl border border-border bg-card px-7 py-5 shadow-sm"
              >
                <div className="text-3xl font-extrabold tabular-nums text-primary">{s.stat_value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{statLabels[s.stat_key]}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 overflow-hidden rounded-3xl border border-border shadow-lg">
          <Picture
            srcAvif={heroImageAvif}
            srcWebp={heroImageWebp}
            srcFallback={heroImage}
            alt="JSR COACHING ke students board exam ki taiyari karte hue"
            width={1280}
            height={800}
            className="w-full h-auto object-cover"
          />
        </div>
      </div>
    </section>
  );
});

Hero.displayName = "Hero";
export default Hero;
