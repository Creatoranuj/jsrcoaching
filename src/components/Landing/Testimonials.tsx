import { memo } from "react";
import { Star, Quote } from "lucide-react";
import { useTestimonials } from "@/hooks/useTestimonials";

interface Props {
  /** Filter by exam_track (used on exam landing pages) */
  examTrack?: string;
  title?: string;
}

/**
 * Full-bleed dark testimonial band — inverts the page rhythm and gives
 * proof-of-work its own visual anchor. Uses the secondary token so
 * dark-mode already works.
 */
const Testimonials = memo(({ examTrack, title = "Students kya kehte hain" }: Props) => {
  const { data: items = [], isLoading } = useTestimonials(examTrack);

  if (!isLoading && items.length === 0) return null;

  return (
    <section
      aria-label="Student testimonials"
      className="py-20 md:py-28 bg-secondary text-secondary-foreground relative overflow-hidden"
    >
      {/* Subtle radial highlight, decorative */}
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.18),transparent_55%)] pointer-events-none"
        aria-hidden
      />

      <div className="container mx-auto max-w-7xl px-6 lg:px-10 relative">
        <div className="max-w-2xl mb-10 md:mb-14">
          <p className="eyebrow !text-accent mb-4">Real results</p>
          <h2
            className="font-serif text-display-sm md:text-display-md leading-[1.05]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {title}
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 rounded-2xl bg-secondary-foreground/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex md:grid md:grid-cols-3 gap-4 md:gap-5 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none -mx-6 md:mx-0 px-6 md:px-0 pb-2 md:pb-0 scrollbar-hide">
            {items.map((t) => (
              <article
                key={t.id}
                className="snap-start shrink-0 w-[85%] md:w-auto rounded-2xl border border-secondary-foreground/10 bg-secondary-foreground/5 backdrop-blur-sm p-6 flex flex-col transition-transform hover:-translate-y-1"
              >
                <Quote className="h-6 w-6 text-accent/70 mb-3" aria-hidden />
                <p className="text-sm md:text-[15px] text-secondary-foreground/90 leading-relaxed mb-4 flex-1">
                  {t.quote}
                </p>
                <div className="flex items-center gap-3">
                  {t.avatar_url ? (
                    <img
                      src={t.avatar_url}
                      alt={t.student_name}
                      className="h-10 w-10 rounded-full object-cover border border-secondary-foreground/20"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-accent/20 text-accent flex items-center justify-center font-semibold text-sm">
                      {t.student_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {t.student_name}
                    </p>
                    {t.exam_track && (
                      <p className="text-xs text-secondary-foreground/60 truncate">{t.exam_track}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5" aria-label={`${t.rating} stars`}>
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
});

Testimonials.displayName = "Testimonials";
export default Testimonials;
