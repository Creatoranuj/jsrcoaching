import { memo, Suspense } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, CheckCircle2, GraduationCap } from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { examTrackByRoute, type ExamTrack } from "@/config/examTracks";

const LeadForm = lazyWithRetry(() => import("@/components/Landing/LeadForm"));
const Footer = lazyWithRetry(() => import("@/components/Landing/Footer"));
const Testimonials = lazyWithRetry(() => import("@/components/Landing/Testimonials"));
import WhatsAppFloat from "@/components/common/WhatsAppFloat";

const ExamLanding = memo(() => {
  const location = useLocation();
  const track: ExamTrack | undefined = examTrackByRoute(location.pathname);

  if (!track) return <Navigate to="/" replace />;

  const canonical = track.route ?? "/";
  const courseJsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: track.title,
    description: track.hero.metaDescription,
    provider: {
      "@type": "Organization",
      name: "JSR COACHING",
      sameAs: "https://www.youtube.com/channel/UCJig1qwQQN3doNzobNDlB_A",
    },
    inLanguage: ["hi", "en"],
    educationalLevel: track.badge,
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      instructor: { "@type": "Person", name: track.faculty },
    },
  };
  const faqJsonLd = track.faqs.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: track.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }
    : null;

  return (
    <div className="min-h-dvh bg-background">
      <Helmet>
        <title>{track.hero.metaTitle}</title>
        <meta name="description" content={track.hero.metaDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={track.hero.metaTitle} />
        <meta property="og:description" content={track.hero.metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(courseJsonLd)}</script>
        {faqJsonLd && (
          <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
        )}
      </Helmet>

      <header className="border-b border-border">
        <div className="container mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <Link to="/" className="font-serif text-base" style={{ fontFamily: "var(--font-serif)" }}>
            ← JSR COACHING
          </Link>
          <Link to="/signup">
            <Button className="h-9 px-4 text-sm">Sign up free</Button>
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="py-14 md:py-20 border-b border-border/60">
          <div className="container mx-auto max-w-6xl px-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider px-3 py-1 mb-4">
              <GraduationCap className="h-3.5 w-3.5" />
              {track.badge}
            </span>
            <h1
              className="font-serif text-3xl md:text-5xl text-foreground leading-[1.1] mb-4 max-w-3xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {track.hero.h1}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed mb-6">
              {track.hero.subtitle}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/signup">
                <Button className="h-11 px-6 text-sm font-medium">
                  Free demo dekhein <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
              <a href="#syllabus" className="text-sm font-medium text-foreground hover:text-accent transition-colors">
                Full syllabus ↓
              </a>
            </div>

            {track.priceEffective && (
              <div className="mt-6 inline-flex items-baseline gap-2 tabular-nums text-sm">
                <span className="text-2xl font-bold text-foreground">₹{track.priceEffective}</span>
                {track.priceMrp && (
                  <span className="text-muted-foreground line-through">₹{track.priceMrp}</span>
                )}
                <span className="text-accent font-semibold">· {track.duration}</span>
              </div>
            )}
          </div>
        </section>

        {/* Syllabus */}
        <section id="syllabus" className="py-14 md:py-20 border-b border-border/60">
          <div className="container mx-auto max-w-4xl px-6">
            <h2
              className="font-serif text-2xl md:text-3xl text-foreground mb-6"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Complete syllabus
            </h2>
            <Accordion type="single" collapsible className="w-full">
              {track.syllabus.map((s, i) => (
                <AccordionItem key={s.chapter} value={`s-${i}`}>
                  <AccordionTrigger className="text-left font-medium">{s.chapter}</AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2 text-sm text-muted-foreground pl-1">
                      {s.topics.map((t) => (
                        <li key={t} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* What you get */}
        <section className="py-14 md:py-20 border-b border-border/60 bg-muted/30">
          <div className="container mx-auto max-w-4xl px-6">
            <h2
              className="font-serif text-2xl md:text-3xl text-foreground mb-6"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Course mein kya milega
            </h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {track.includes.map((item) => (
                <li key={item} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Faculty */}
        <section className="py-14 md:py-20 border-b border-border/60">
          <div className="container mx-auto max-w-4xl px-6">
            <h2
              className="font-serif text-2xl md:text-3xl text-foreground mb-6"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Aapke mentor
            </h2>
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-wider text-accent font-medium mb-2">Faculty</p>
              <h3 className="font-serif text-xl text-foreground mb-2" style={{ fontFamily: "var(--font-serif)" }}>
                {track.faculty}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                10+ saal ka teaching experience, Hindi medium ke students ko English fluently sikhane
                mein specialization. YouTube channel <em>JSR COACHING Ka</em> pe 5 lakh+ learners.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        {track.faqs.length > 0 && (
          <section className="py-14 md:py-20 border-b border-border/60">
            <div className="container mx-auto max-w-3xl px-6">
              <h2
                className="font-serif text-2xl md:text-3xl text-foreground mb-6"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Common questions
              </h2>
              <Accordion type="single" collapsible className="w-full">
                {track.faqs.map((f, i) => (
                  <AccordionItem key={i} value={`q-${i}`}>
                    <AccordionTrigger className="text-left font-medium">{f.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>
        )}

        {/* Testimonials filtered by track */}
        <Suspense fallback={<div className="min-h-[200px]" aria-hidden />}>
          <Testimonials examTrack={track.badge} title="Isi batch ke students" />
        </Suspense>

        {/* CTA */}
        <section id="free-demo" aria-label="Final CTA">
          <Suspense fallback={<div className="min-h-[200px]" aria-hidden />}>
            <LeadForm />
          </Suspense>
        </section>
      </main>

      <Suspense fallback={<div className="min-h-[180px]" aria-hidden />}>
        <Footer />
      </Suspense>

      <WhatsAppFloat />
    </div>
  );
});

ExamLanding.displayName = "ExamLanding";
export default ExamLanding;
