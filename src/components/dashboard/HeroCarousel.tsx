import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHeroBanners, HeroBanner } from "../../hooks/useHeroBanners";
import { SmartImage } from "../common/SmartImage";
import { cn } from "../../lib/utils";
import { openResource } from "../../lib/openResource";

const FALLBACK_BANNERS: HeroBanner[] = [
  {
    id: "1",
    title: "Board Exam 2025 — Complete Revision Batch",
    subtitle: "New Batch Starting Soon",
    description: "Class 10 & 12 ke liye chapter-wise revision, important questions aur full mock tests.",
    image_url: null,
    bg_color: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
    badge_text: "🎉 Board Exam 2025",
    cta_text: "Enroll Now",
    cta_link: "/courses",
    position: 0,
    is_active: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "2",
    title: "Class 10 Maths & Science Crash Course",
    subtitle: "Score 90+ in Board Exams",
    description: "Formula tricks, previous year questions aur timed practice — Hindi mein simple explanation.",
    image_url: null,
    bg_color: "linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)",
    badge_text: "🔬 Class 10",
    cta_text: "Register Now",
    cta_link: "/courses",
    position: 1,
    is_active: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "3",
    title: "Free Scholarship Test!",
    subtitle: "Upto 100% Fee Waiver",
    description: "Attempt our online scholarship test and win upto 100% fee waiver on board exam batches.",
    image_url: null,
    bg_color: "linear-gradient(135deg, #059669 0%, #047857 100%)",
    badge_text: "🏆 Scholarship",
    cta_text: "Attempt Free Test",
    cta_link: "/all-tests",
    position: 2,
    is_active: true,
    created_at: "",
    updated_at: "",
  },
];

const AUTO_SLIDE_INTERVAL = 6000;

export default function HeroCarousel() {
  const navigate = useNavigate();
  const { data: dbBanners, isLoading } = useHeroBanners();
  const banners = dbBanners && dbBanners.length > 0 ? dbBanners : FALLBACK_BANNERS;

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [currentIndex, setCurrentIndex] = useState(0);
  const isPaused = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCurrentIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const start = () => {
      timerRef.current = setInterval(() => {
        if (!isPaused.current) emblaApi.scrollNext();
      }, AUTO_SLIDE_INTERVAL);
    };
    start();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [emblaApi]);

  const handleCTA = (banner: HeroBanner) => {
    const link = banner.cta_link || "/courses";
    if (link.startsWith("http://") || link.startsWith("https://")) {
      if (!link.startsWith("https://")) {
        console.warn("[HeroCarousel] Blocked non-https CTA link:", link);
        return;
      }
      void openResource({ url: link, kind: "link" });
    } else if (link.startsWith("/")) {
      navigate(link);
    } else {
      console.warn("[HeroCarousel] Blocked unsupported CTA scheme:", link);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full min-h-[186px] aspect-[12/5] md:min-h-0 md:h-52 rounded-2xl bg-muted animate-pulse" />
    );
  }


  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl select-none"
      onMouseEnter={() => { isPaused.current = true; }}
      onMouseLeave={() => { isPaused.current = false; }}
    >
      <div ref={emblaRef} className="overflow-hidden rounded-2xl">
        <div className="flex touch-pan-y">
          {banners.map((banner, idx) => (
            <div
              key={banner.id}
              className="relative flex-[0_0_100%] min-w-0"
            >
              <BannerSlide banner={banner} onCTA={handleCTA} priority={idx === 0} />
            </div>
          ))}
        </div>
      </div>

      {banners.length > 1 && (
        <>
          <button
            onClick={scrollPrev}
            className="hidden sm:block absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full p-1.5 transition-all backdrop-blur-sm"
            aria-label="Previous banner"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            onClick={scrollNext}
            className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full p-1.5 transition-all backdrop-blur-sm"
            aria-label="Next banner"
          >
            <ChevronRight className="h-4 w-4" />
          </button>


          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-20 pointer-events-auto">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                className={cn(
                  "rounded-full transition-all duration-300",
                  i === currentIndex
                    ? "bg-white w-5 h-2"
                    : "bg-white/50 w-2 h-2 hover:bg-white/75"
                )}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

        </>
      )}
    </div>
  );
}

function BannerSlide({
  banner,
  onCTA,
  priority = false,
}: {
  banner: HeroBanner;
  onCTA: (b: HeroBanner) => void;
  priority?: boolean;
}) {
  const isGradient =
    banner.bg_color?.startsWith("linear-gradient") ||
    banner.bg_color?.startsWith("radial-gradient");

  return (
    <div
      className="relative w-full min-h-[186px] aspect-[12/5] overflow-hidden rounded-2xl flex items-center ring-1 ring-white/10 shadow-lg"
      style={
        isGradient
          ? { backgroundImage: banner.bg_color }
          : { backgroundColor: banner.bg_color }
      }
    >
      {banner.image_url && (
        <>
          <SmartImage
            src={banner.image_url}
            alt=""
            width={1440}
            height={600}
            priority={priority}
            className="absolute inset-0 w-full h-full object-cover object-center opacity-25"
          />
          <SmartImage
            src={banner.image_url}
            alt=""
            width={640}
            height={600}
            className="absolute right-0 bottom-0 h-full max-w-[42%] object-contain object-right-bottom hidden md:block drop-shadow-2xl"
          />
        </>
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />

      <div className="relative z-10 min-w-0 flex-1 px-4 md:px-8 py-3 pb-6 md:py-4 max-w-[78%] sm:max-w-[70%] md:max-w-[55%] space-y-1.5 md:space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {banner.badge_text && (
            <span className="inline-block max-w-full truncate bg-white/20 backdrop-blur-sm text-white text-[11px] md:text-xs font-semibold px-2.5 md:px-3 py-0.5 md:py-1 rounded-full border border-white/30">
              {banner.badge_text}
            </span>
          )}
          {banner.subtitle && (
            <span className="hidden md:inline text-white/90 text-sm font-medium">
              {banner.subtitle}
            </span>
          )}
        </div>

        <h2 className="text-white font-extrabold md:font-serif md:font-bold text-lg sm:text-xl md:text-3xl lg:text-4xl leading-tight tracking-tight drop-shadow-sm line-clamp-2 break-words">
          {banner.title}
        </h2>

        {banner.subtitle && (
          <p className="hidden sm:block md:hidden text-white/90 text-sm font-medium line-clamp-1">
            {banner.subtitle}
          </p>
        )}

        {banner.description && (
          <p className="hidden md:block text-white/80 text-sm line-clamp-2">
            {banner.description}
          </p>
        )}

        <button
          onClick={() => onCTA(banner)}
          className="mt-1 inline-flex max-w-full items-center gap-1.5 bg-background text-foreground hover:bg-background/90 font-bold text-xs md:text-sm px-3.5 md:px-4 py-1.5 md:py-2 rounded-full transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="truncate">{banner.cta_text}</span>
        </button>
      </div>


      <div className="absolute bottom-0 right-0 hidden sm:flex items-center bg-primary text-primary-foreground pl-8 pr-5 py-2.5 rounded-tl-[48px] shadow-xl pointer-events-none">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-90">
          {banner.badge_text ? "Featured" : "New"}
        </span>
      </div>
    </div>
  );
}
