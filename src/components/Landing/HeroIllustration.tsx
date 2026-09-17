import { memo } from "react";
import { Play } from "lucide-react";
import Picture from "../ui/Picture";
import mentorUrl from "../../assets/landing/mentor-portrait.jpg";
import mentorWebp from "../../assets/landing/mentor-portrait.webp";
import mentorAvif from "../../assets/landing/mentor-portrait.avif";
import studentGirlUrl from "../../assets/landing/student-portrait.jpg";
import studentGirlWebp from "../../assets/landing/student-portrait.webp";
import studentGirlAvif from "../../assets/landing/student-portrait.avif";
import { selectionHaptic } from "@/lib/native/haptics";

const scrollToCourses = () => {
  void selectionHaptic();
  document.getElementById("courses")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const HeroIllustration = memo(() => (
  <div
    className="relative w-full max-w-[560px] mx-auto min-w-0
               pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
  >
    <div className="relative w-full aspect-[5/4] select-none">
      <div
        className="absolute inset-[8%] rounded-full
                   bg-[radial-gradient(circle_at_30%_30%,hsl(var(--primary)/0.22),hsl(var(--accent)/0.14)_45%,transparent_70%)]
                   blur-2xl"
        aria-hidden
      />

      <div className="absolute top-0 right-0 w-[54%] aspect-square animate-fade-in-up [animation-delay:0.1s]">
        <div
          className="absolute inset-0 rounded-full overflow-hidden ring-1 ring-primary/25 bg-primary/5
                     shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.35)]"
        >
          <Picture
            srcAvif={studentGirlAvif}
            srcWebp={studentGirlWebp}
            srcFallback={studentGirlUrl}
            alt="JSR COACHING student preparing for board exams"
            width={768}
            height={768}
            priority
            pictureClassName="block h-full w-full"
            className="h-full w-full object-cover object-top"
          />
        </div>
        <div
          aria-hidden
          className="absolute -bottom-1 -right-1 h-9 w-9 rounded-xl bg-primary text-primary-foreground
                     flex items-center justify-center shadow-lg shadow-primary/40
                     animate-[bounce_3.2s_ease-in-out_infinite] motion-reduce:animate-none"
        >
          <Play className="h-4 w-4 fill-current" />
        </div>
      </div>

      <button
        type="button"
        onClick={scrollToCourses}
        className="absolute top-[2%] left-[2%] z-10 max-w-[40%] text-left
                   rounded-2xl rounded-bl-sm bg-background/95 border border-border
                   px-3 py-2 shadow-lg backdrop-blur-sm
                   text-[11px] sm:text-xs font-medium text-foreground leading-snug
                   active:scale-[0.97] transition-transform duration-150 ease-out
                   animate-fade-in-up [animation-delay:0.35s]"
      >
        Pankaj Sir, board exam<br />mein top kaise karun?
      </button>

      <div className="absolute bottom-0 left-[4%] w-[44%] aspect-square animate-fade-in-up [animation-delay:0.2s]">
        <svg
          className="absolute -inset-[6%] w-[112%] h-[112%] motion-safe:animate-[spin_22s_linear_infinite] motion-reduce:animate-none drop-shadow-[0_2px_6px_hsl(var(--primary)/0.25)]"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeOpacity="0.7"
            strokeWidth="1.25"
            strokeDasharray="2.2 3"
            strokeLinecap="round"
          />
        </svg>
        <div
          className="absolute inset-0 rounded-full overflow-hidden ring-2 ring-primary/40 bg-primary/5
                     shadow-[0_16px_48px_-16px_hsl(var(--primary)/0.4)]"
        >
          <Picture
            srcAvif={mentorAvif}
            srcWebp={mentorWebp}
            srcFallback={mentorUrl}
            alt="Pankaj Sir — founding faculty, JSR COACHING"
            width={768}
            height={768}
            pictureClassName="block h-full w-full"
            className="h-full w-full object-cover object-top"
          />
        </div>
        <div
          aria-hidden
          className="absolute -top-1 -left-1 h-9 w-9 rounded-xl bg-emerald-500 text-white
                     flex items-center justify-center shadow-lg shadow-emerald-500/40
                     animate-[bounce_2.8s_ease-in-out_infinite] motion-reduce:animate-none"
        >
          <Play className="h-4 w-4 fill-current" />
        </div>
      </div>

      <button
        type="button"
        onClick={scrollToCourses}
        className="absolute bottom-0 right-0 max-w-[50%] text-left
                   rounded-2xl rounded-br-sm bg-primary text-primary-foreground
                   px-3 py-2 shadow-lg shadow-primary/30
                   text-[11px] sm:text-xs font-semibold leading-snug
                   active:scale-[0.97] transition-transform duration-150 ease-out
                   animate-fade-in-up [animation-delay:0.5s]"
      >
        JSR COACHING ke Saath<br />Board exam ke liye confident banein.
      </button>
    </div>
  </div>
));

HeroIllustration.displayName = "HeroIllustration";
export default HeroIllustration;
