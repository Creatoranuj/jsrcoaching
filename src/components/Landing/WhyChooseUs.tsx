import { memo } from "react";
import { Check } from "lucide-react";
import Picture from "../ui/Picture";
import mentorImage from "../../assets/landing/mentor-portrait.jpg";
import mentorImageWebp from "../../assets/landing/mentor-portrait.webp";
import mentorImageAvif from "../../assets/landing/mentor-portrait.avif";

const points = [
  { t: "Hindi-medium friendly", d: "Har lesson Hindi mein samjhaya — jhijhak khatam, seekhna aasan." },
  { t: "Board-focused lessons", d: "Syllabus ke hisaab se chapter-wise videos, notes aur practice papers." },
  { t: "Daily practice + doubts", d: "Roz ka chota task aur live doubt-clearing Ramchandra Sir ke saath." },
  { t: "Revision + mock tests", d: "Regular tests aur full-length mocks se exam confidence aur time management dono improve." },
];

const WhyChooseUs = memo(() => (
  <section className="py-16 md:py-20 bg-background">
    <div className="container mx-auto max-w-5xl px-5 md:px-8">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div className="overflow-hidden rounded-3xl border border-border shadow-sm order-last md:order-first">
          <Picture
            srcAvif={mentorImageAvif}
            srcWebp={mentorImageWebp}
            srcFallback={mentorImage}
            alt="Ramchandra Sir class lete hue"
            width={768}
            height={768}
            pictureClassName="block h-full w-full"
            className="w-full h-full object-cover aspect-[4/3]"
          />
        </div>

        <div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
            Why Choose JSR COACHING?
          </h2>
          <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
            Traditional discipline + modern teaching + Hindi explanation. Har din 15 minute — aur
            aap khud farak dekhenge.
          </p>

          <ul className="mt-7 space-y-4">
            {points.map((p) => (
              <li key={p.t} className="flex gap-3">
                <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-bold text-foreground">{p.t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </section>
));

WhyChooseUs.displayName = "WhyChooseUs";
export default WhyChooseUs;
