import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LogIn,
  MapPin,
  Menu,
  Phone,
  Play,
  Send,
  ShieldCheck,
  Target,
  Trophy,
  UserPlus,
  Users,
  X,
  Youtube,
} from "lucide-react";

import classroomImage from "@/assets/jsr-classroom.webp";
import mockTestImage from "@/assets/jsr-mock-test.webp";
import { JSRMark } from "@/components/brand/JSRMark";
import { WhatsAppIcon } from "@/components/brand/WhatsAppIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useHero } from "@/hooks/useHero";
import { useLandingCourses } from "@/hooks/useLandingCourses";
import { supabase } from "@/integrations/supabase/client";
import WhatsAppFab from "@/components/common/WhatsAppFab";
import { WHATSAPP_NUMBER } from "@/components/common/WhatsAppButton";
import { openResource } from "@/lib/openResource";

export interface HomepageCourse {
  id: string;
  title: string;
  short: string;
  badge: string;
  duration: string;
  price_mrp: number | null;
  price_effective: number | null;
}

const defaultCourses: HomepageCourse[] = [
  ["class-9", "Class 9 Foundation", "Strong basics for school exams", "Foundation"],
  ["class-10", "Class 10 Board Preparation", "Board-focused concepts and practice", "Board"],
  ["class-11", "Class 11 Concept Builder", "Core concepts for a confident start", "Foundation"],
  ["class-12", "Class 12 Board Preparation", "Revision, practice and board strategy", "Board"],
  ["ssc", "SSC Exam Preparation", "English, reasoning, maths and practice", "Competitive"],
  ["railway", "Railway Exam Preparation", "Complete preparation with mock practice", "Competitive"],
].map(([id, title, short, badge]) => ({
  id,
  title,
  short,
  badge,
  duration: "Batch details on WhatsApp",
  price_mrp: null,
  price_effective: null,
}));

const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;
const YOUTUBE_URL = "https://www.youtube.com/channel/UCP4lJcfTj9AnAS3vutTuMHA";
const MAPS_URL = "https://maps.app.goo.gl/94xmibXHD3K2KsQV8?g_st=ac";
const ADDRESS = "Ugapur Road, Uttar Pradesh 221301";

function whatsappLink(base: string, text: string) {
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}text=${encodeURIComponent(text)}`;
}

function AuthButtons({ stacked = false }: { stacked?: boolean }) {
  const { user } = useAuth();
  const size = stacked ? "h-11" : "";
  if (user) {
    return (
      <>
        <Button asChild variant="ghost" className={size}>
          <Link to="/my-courses">
            <BookOpen /> My Courses
          </Link>
        </Button>
        <Button asChild variant="outline" className={size}>
          <Link to="/dashboard">
            <LayoutDashboard /> Dashboard
          </Link>
        </Button>
      </>
    );
  }
  return (
    <>
      <Button asChild variant="ghost" className={size}>
        <Link to="/login">
          <LogIn /> Login
        </Link>
      </Button>
      <Button asChild variant="outline" className={size}>
        <Link to="/signup">
          <UserPlus /> Signup
        </Link>
      </Button>
    </>
  );
}

const FAB_MESSAGE = "Namaste JSR COACHING, mujhe admission aur batch details chahiye.";

/**
 * Phone-only bottom action bar: Signup/Login (or Dashboard).
 *
 * WhatsApp used to sit at the left end of this centred bar, where it collided
 * with the Signup pill and read as part of the auth row. It now lives in the
 * right-hand FAB column (`raised` slot) directly above the JSR Agent bubble,
 * matching every other screen in the app.
 *
 * The full-width wrapper is `pointer-events-none` so footer links behind the
 * strip stay tappable; only the pills themselves take taps. Every control is
 * 48px tall (>44px) and the bar adds `env(safe-area-inset-bottom)`.
 */
function MobileActionBar() {
  const { user } = useAuth();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:hidden">
      <div className="pointer-events-auto flex items-center gap-2">
        {user ? (
          <Button
            asChild
            className="h-12 rounded-full bg-gold px-7 font-semibold text-ink shadow-lg transition-transform hover:scale-105 motion-reduce:transition-none"
          >
            <Link to="/dashboard" aria-label="Dashboard kholein">
              <LayoutDashboard /> Dashboard
            </Link>
          </Button>
        ) : (
          <>
            <Button
              asChild
              className="h-12 rounded-full bg-gold px-5 font-semibold text-ink shadow-lg transition-transform hover:scale-105 motion-reduce:transition-none"
            >
              <Link to="/signup" aria-label="Signup karein">
                <UserPlus /> Signup
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-full border-ink/20 bg-background/95 px-5 font-semibold shadow-lg backdrop-blur transition-transform hover:scale-105 motion-reduce:transition-none"
            >
              <Link to="/login" aria-label="Login karein">
                <LogIn /> Login
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Index() {
  const { data: hero } = useHero();
  const { data: landingCourses } = useLandingCourses();
  const [menuOpen, setMenuOpen] = useState(false);

  const courses: HomepageCourse[] =
    landingCourses && landingCourses.length > 0
      ? landingCourses.map((course) => ({
          id: course.id,
          title: course.title,
          short: course.short || "Batch details WhatsApp par milengi.",
          badge: course.badge || "Batch",
          duration: course.duration || "Batch details on WhatsApp",
          price_mrp: course.price_mrp,
          price_effective: course.price_effective,
        }))
      : defaultCourses;

  const heroTitle = hero?.title?.trim() || "Competition ki taiyari, ab sahi direction mein.";
  const heroSubtitle =
    hero?.subtitle?.trim() ||
    "Class 9 se 12 tak strong foundation, aur SSC–Railway ke liye focused preparation.";

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="bg-ink text-ink-foreground">
        <div className="mx-auto flex min-h-10 max-w-7xl items-center justify-center gap-x-5 gap-y-1 px-4 py-2 text-center text-xs font-semibold sm:justify-between sm:px-6 lg:px-8">
          <span className="hidden items-center gap-2 sm:flex">
            <MapPin className="size-3.5 text-gold" /> {ADDRESS}
          </span>
          <a
            className="flex items-center gap-2 transition-colors hover:text-gold"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
          >
            <Phone className="size-3.5" /> Admission help: +91 6386474017
          </a>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#top" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <JSRMark />
          </a>
          <nav className="hidden items-center gap-6 text-sm font-semibold lg:flex" aria-label="Main navigation">
            <a className="transition-colors hover:text-accent" href="#about">About</a>
            <a className="transition-colors hover:text-accent" href="#courses">Courses</a>
            <a className="transition-colors hover:text-accent" href="#preparation">Preparation</a>
            <a className="transition-colors hover:text-accent" href="#faq">FAQs</a>
            <a className="transition-colors hover:text-accent" href="#contact">Contact</a>
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <Button variant="ghost" asChild className="hidden lg:inline-flex">
              <a href={YOUTUBE_URL} target="_blank" rel="noreferrer">
                <Youtube /> YouTube
              </a>
            </Button>
            <AuthButtons />
            <Button asChild className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90">
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                <WhatsAppIcon /> WhatsApp
              </a>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={menuOpen ? "Menu band karein" : "Menu kholein"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
        {menuOpen && (
          <nav
            id="mobile-nav"
            className="border-t border-border bg-background px-4 py-4 lg:hidden"
            aria-label="Mobile navigation"
          >
            <div className="mx-auto grid max-w-7xl gap-1">
              {[
                ["About JSR", "#about"],
                ["Courses", "#courses"],
                ["Preparation", "#preparation"],
                ["FAQs", "#faq"],
                ["Contact", "#contact"],
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-md px-3 py-3 font-semibold hover:bg-muted"
                >
                  {label}
                </a>
              ))}
              <div className="mt-2 grid gap-2 sm:hidden">
                <AuthButtons stacked />
              </div>
              <div className="mt-2 grid gap-2 sm:hidden">
                <Button asChild className="h-11 bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90">
                  <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                    <WhatsAppIcon /> WhatsApp par baat karein
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-11">
                  <a href={YOUTUBE_URL} target="_blank" rel="noreferrer">
                    <Youtube /> YouTube channel
                  </a>
                </Button>
              </div>
            </div>
          </nav>
        )}
      </header>

      <main id="top">
        <section className="relative isolate min-h-[620px] overflow-hidden bg-ink text-ink-foreground">
          <img
            src={classroomImage}
            alt="JSR COACHING classroom mein padhte students"
            width={1440}
            height={912}
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-[62%_center] opacity-65"
          />
          <div className="hero-overlay absolute inset-0" />
          <div className="relative mx-auto flex min-h-[620px] max-w-7xl items-center px-4 py-20 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 border-l-2 border-gold bg-ink/75 px-4 py-2 text-sm font-bold text-gold backdrop-blur-sm">
                <Trophy className="size-4" /> Competition ki taiyari ke liye best
              </div>
              <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-7xl">
                {heroTitle}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-foreground/85 sm:text-xl">
                {heroSubtitle}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild className="h-12 bg-gold px-6 text-gold-foreground hover:bg-gold/90">
                  <a href="#courses">
                    Apna batch chuniye <ArrowRight />
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="h-12 border-ink-foreground/40 bg-ink/25 px-6 text-ink-foreground hover:bg-ink-foreground hover:text-ink"
                >
                  <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                    <WhatsAppIcon /> Free counselling
                  </a>
                </Button>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-ink-foreground/85">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-gold" /> Hindi-friendly teaching
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-gold" /> Regular practice
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-gold" /> Doubt support
                </span>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="JSR programs" className="border-b border-border bg-muted">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {[
              ["Class 9–12", "School & board prep"],
              ["SSC", "Exam-focused batches"],
              ["Railway", "Complete preparation"],
              ["1:1", "Doubt guidance"],
            ].map(([value, label]) => (
              <div key={value} className="bg-muted px-4 py-7 text-center">
                <div className="font-display text-2xl font-bold text-ink">{value}</div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground sm:text-sm">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="about" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
            <div>
              <SectionHeading
                eyebrow="About JSR COACHING"
                title="School se selection tak, ek clear learning path."
                copy="JSR COACHING mein preparation ko sirf syllabus tak nahi rakha jata. Har batch mein concepts, guided practice, revision aur doubt support ko ek saath joda jata hai."
              />
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  [BookOpen, "Concept clarity", "Hindi-friendly explanation ke saath strong basics."],
                  [ClipboardCheck, "Practice discipline", "Regular questions, revision aur exam-focused practice."],
                  [Users, "Doubt support", "Students ko topics aur next steps par guidance."],
                  [Target, "Goal-based batches", "Class 9–12, SSC aur Railway ke liye focused plans."],
                ].map(([Icon, title, copy]) => {
                  const AboutIcon = Icon as typeof BookOpen;
                  return (
                    <div key={String(title)} className="border-l-2 border-gold pl-4">
                      <AboutIcon className="size-5 text-accent" />
                      <h3 className="mt-3 font-display text-lg font-bold text-ink">{String(title)}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{String(copy)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="relative overflow-hidden bg-ink">
              <img
                src={mockTestImage}
                alt="JSR COACHING ke students mock test practice karte hue"
                loading="lazy"
                width={1440}
                height={1088}
                className="aspect-[4/3] size-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-ink/90 p-5 text-ink-foreground backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="size-5 text-gold" />
                  <span className="font-display text-lg font-bold">Learn · Practice · Improve</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="courses" className="scroll-mt-24 border-y border-border bg-muted/45 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Our Courses"
              title="Har goal ke liye focused batch"
              copy="School concepts se competitive selection tak—structured learning aur regular practice ke saath."
            />
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((course, index) => (
                <CourseCard key={course.id} course={course} index={index} />
              ))}
            </div>
          </div>
        </section>

        <section id="preparation" className="scroll-mt-24 bg-ink py-20 text-ink-foreground sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <span className="text-sm font-bold uppercase text-gold">JSR Preparation System</span>
                <h2 className="mt-3 font-display text-3xl font-bold sm:text-5xl">
                  Padhai jo exam hall mein kaam aaye.
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-8 text-ink-foreground/70">
                  Clear concepts, planned revision aur continuous practice—taaki har student confidence ke saath
                  attempt kare.
                </p>
                <Button asChild className="mt-8 bg-gold text-gold-foreground hover:bg-gold/90">
                  <a href={YOUTUBE_URL} target="_blank" rel="noreferrer">
                    <Play /> YouTube par padhein
                  </a>
                </Button>
              </div>
              <div className="grid gap-px bg-ink-foreground/15 sm:grid-cols-2">
                {[
                  [Target, "Exam-oriented planning", "Syllabus ko practical milestones mein divide karke preparation."],
                  [BookOpen, "Concept + practice", "Samajhne ke baad questions, revision aur tests."],
                  [Users, "Student-first support", "Doubts aur progress par regular guidance."],
                  [ShieldCheck, "Trusted guidance", "Class 9–12 se SSC–Railway tak focused mentorship."],
                ].map(([Icon, title, copy]) => {
                  const FeatureIcon = Icon as typeof Target;
                  return (
                    <div key={String(title)} className="bg-ink p-6 sm:p-8">
                      <FeatureIcon className="size-7 text-gold" />
                      <h3 className="mt-5 font-display text-xl font-bold">{String(title)}</h3>
                      <p className="mt-2 text-sm leading-6 text-ink-foreground/65">{String(copy)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Preparation journey"
              title="Taiyari ke chaar seedhe steps"
              copy="Har learner ko ek practical sequence milta hai—samajhna, practice karna, check karna aur improve karna."
            />
            <ol className="mt-12 grid gap-px bg-border md:grid-cols-4">
              {[
                ["01", "Concept class", "Topic ko simple language aur examples ke saath samjhein."],
                ["02", "Guided practice", "Class ke baad relevant questions aur exercises karein."],
                ["03", "Revision & test", "Regular revision se retention aur exam readiness check karein."],
                ["04", "Doubt & improve", "Weak areas par guidance lekar next attempt better banayein."],
              ].map(([step, title, copy]) => (
                <li key={step} className="bg-background p-6 sm:p-8">
                  <span className="font-display text-sm font-bold text-accent">STEP {step}</span>
                  <h3 className="mt-5 font-display text-xl font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-y border-border bg-muted/45 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-end">
              <SectionHeading
                eyebrow="Learn with JSR"
                title="Class ke baad bhi learning jaari."
                copy="JSR COACHING ke YouTube channel par concept videos aur preparation guidance dekhein. Batch aur admission information ke liye WhatsApp par baat karein."
              />
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button size="lg" asChild className="h-12">
                  <a href={YOUTUBE_URL} target="_blank" rel="noreferrer">
                    <Youtube /> JSR COACHING YouTube
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12">
                  <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                    <WhatsAppIcon /> Admission poochhein
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
            <SectionHeading
              eyebrow="FAQs"
              title="Admission se pehle zaroori sawaal"
              copy="Aur kuch poochna ho to WhatsApp par seedha message karein."
            />
            <div className="divide-y divide-border border-y border-border">
              {[
                [
                  "JSR COACHING mein kaun se courses hain?",
                  "Class 9, Class 10, Class 11, Class 12, SSC aur Railway preparation ke batches available hain.",
                ],
                [
                  "Course fee kaise pata chalegi?",
                  "Jis course ki latest fee available hai, woh course card par dikhegi. Baaki fee aur batch details WhatsApp par milengi.",
                ],
                [
                  "Enquiry form submit karne par kya hota hai?",
                  "Aapki enquiry JSR COACHING team tak pahunch jaati hai aur WhatsApp message bhi khulta hai, jise aap bhejne se pehle check kar sakte hain.",
                ],
                [
                  "Institute ka location kaise dekhein?",
                  "Contact section mein location link Google Maps par Ugapur Road ka pinned address kholta hai.",
                ],
              ].map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold text-ink">
                    <span>{question}</span>
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-accent transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pt-3 text-sm leading-7 text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="scroll-mt-24 border-t border-border bg-muted/45 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div>
              <span className="text-sm font-bold uppercase text-accent">Admission enquiry</span>
              <h2 className="mt-3 font-display text-3xl font-bold text-ink sm:text-5xl">
                Apne liye sahi batch chuniye.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
                Form bhariye. Aapki enquiry JSR COACHING tak pahunch jayegi aur WhatsApp bhi khulega.
              </p>
              <div className="mt-9 space-y-5">
                <ContactLink icon={Phone} label="WhatsApp" value="+91 6386474017" href={WHATSAPP_URL} />
                <ContactLink icon={MapPin} label="Institute" value={ADDRESS} href={MAPS_URL} />
                <ContactLink icon={Youtube} label="YouTube" value="JSR COACHING YouTube" href={YOUTUBE_URL} />
              </div>
              <div className="mt-8 flex items-start gap-3 border-l-2 border-gold bg-background p-4 text-sm leading-6 text-muted-foreground">
                <CalendarDays className="mt-0.5 size-5 shrink-0 text-accent" />
                <span>Current batch timing aur available seats WhatsApp par confirm karein.</span>
              </div>
            </div>
            <EnquiryForm courses={courses} />
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-foreground/10 bg-ink py-10 pb-28 text-ink-foreground sm:pb-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <JSRMark inverse />
          <div className="text-sm text-ink-foreground/65">Class 9–12 · SSC · Railway</div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" asChild className="text-ink-foreground hover:bg-ink-foreground/10 hover:text-gold">
              <a href={YOUTUBE_URL} target="_blank" rel="noreferrer" aria-label="JSR COACHING on YouTube">
                <Youtube />
              </a>
            </Button>
            <Button variant="ghost" size="icon" asChild className="text-ink-foreground hover:bg-ink-foreground/10 hover:text-gold">
              <a href={MAPS_URL} target="_blank" rel="noreferrer" aria-label="JSR COACHING on Google Maps">
                <MapPin />
              </a>
            </Button>
            <Button variant="ghost" size="icon" asChild className="text-ink-foreground hover:bg-ink-foreground/10 hover:text-gold">
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="Message JSR COACHING on WhatsApp">
                <WhatsAppIcon />
              </a>
            </Button>
          </div>
        </div>
      </footer>

      {/* Right-hand FAB column: WhatsApp sits one slot above the JSR Agent bubble. */}
      <WhatsAppFab phone={WHATSAPP_NUMBER} message={FAB_MESSAGE} />

      <MobileActionBar />
    </div>
  );
}

function CourseCard({ course, index }: { course: HomepageCourse; index: number }) {
  const Icon = index < 4 ? GraduationCap : Target;
  const price = course.price_effective;
  const message = `Namaste JSR COACHING, mujhe ${course.title} ke baare mein fees aur admission details chahiye.`;
  return (
    <article className="group flex min-h-72 flex-col border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-gold hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-md bg-muted text-ink">
          <Icon className="size-5" />
        </span>
        <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold-soft-foreground">
          {course.badge}
        </span>
      </div>
      <h3 className="mt-6 font-display text-2xl font-bold text-ink">{course.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{course.short}</p>
      <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
        <Clock3 className="size-4" /> {course.duration}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">Course fee</div>
          {price != null ? (
            <div className="mt-1 flex items-baseline gap-2">
              <strong className="text-xl text-ink">₹{price.toLocaleString("en-IN")}</strong>
              {course.price_mrp != null && (
                <del className="text-xs text-muted-foreground">₹{course.price_mrp.toLocaleString("en-IN")}</del>
              )}
            </div>
          ) : (
            <strong className="mt-1 block text-base text-ink">WhatsApp par poochhein</strong>
          )}
        </div>
        <Button size="icon" variant="ghost" asChild aria-label={`${course.title} enquiry`}>
          <a href={whatsappLink(WHATSAPP_URL, message)} target="_blank" rel="noreferrer">
            <ChevronRight />
          </a>
        </Button>
      </div>
    </article>
  );
}

function EnquiryForm({ courses }: { courses: HomepageCourse[] }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [course, setCourse] = useState(courses[0]?.title ?? "General enquiry");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState({ name: false, phone: false });
  const [saving, setSaving] = useState(false);

  const cleanPhone = phone.replace(/\D/g, "");
  const nameError = touched.name && name.trim().length > 0 && name.trim().length < 2;
  const phoneError = (touched.phone || phone.length > 0) && cleanPhone.length < 10;
  const canSubmit = name.trim().length >= 2 && cleanPhone.length >= 10;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ name: true, phone: true });
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      await supabase.from("leads").insert({
        student_name: name.trim(),
        phone: cleanPhone,
        grade: course,
        source: "landing_contact_form",
        user_id: user?.id ?? null,
      });
    } catch {
      // Enquiry still reaches the team over WhatsApp even if saving fails.
    } finally {
      setSaving(false);
    }
    const text = `Namaste JSR COACHING,\n\nNaam: ${name.trim()}\nPhone: ${cleanPhone}\nCourse: ${course}\nMessage: ${message.trim() || "Fees aur admission details chahiye."}`;
    void openResource({ url: whatsappLink(WHATSAPP_URL, text), kind: "link" });
  }

  return (
    <form onSubmit={submit} className="border border-border bg-card p-6 shadow-md sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Student name</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched((value) => ({ ...value, name: true }))}
            placeholder="Apna naam"
            minLength={2}
            required
            aria-invalid={nameError ? "true" : "false"}
            aria-describedby={nameError ? "name-error" : undefined}
            className="h-11 text-base"
          />
          {nameError && (
            <p id="name-error" className="text-xs text-destructive">
              Kripya poora naam likhein.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Mobile number</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => setTouched((value) => ({ ...value, phone: true }))}
            placeholder="10-digit number"
            inputMode="tel"
            pattern="[0-9 +()-]{10,15}"
            required
            aria-invalid={phoneError ? "true" : "false"}
            aria-describedby={phoneError ? "phone-error" : undefined}
            className="h-11 text-base"
          />
          {phoneError && (
            <p id="phone-error" className="text-xs text-destructive">
              Valid 10-digit mobile number daalein.
            </p>
          )}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="course">Course</Label>
          <select
            id="course"
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {courses.map((item) => (
              <option key={item.id}>{item.title}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="message">Message (optional)</Label>
          <Textarea
            id="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Aap kya jaanna chahte hain?"
            className="min-h-28 text-base"
          />
        </div>
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={!canSubmit || saving}
        className="mt-6 h-12 w-full bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90 disabled:opacity-60"
      >
        <Send /> {saving ? "Bhej rahe hain..." : "WhatsApp par bhejein"}
      </Button>
      <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
        Submit karne par WhatsApp khulega. Koi payment nahi li jayegi.
      </p>
    </form>
  );
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="max-w-2xl">
      <span className="text-sm font-bold uppercase text-accent">{eyebrow}</span>
      <h2 className="mt-3 font-display text-3xl font-bold text-ink sm:text-5xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">{copy}</p>
    </div>
  );
}

function ContactLink({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group flex items-center gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-muted text-ink transition-colors group-hover:bg-gold-soft">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-xs font-bold uppercase text-muted-foreground">{label}</span>
        <span className="mt-1 block font-semibold text-ink group-hover:text-accent">{value}</span>
      </span>
    </a>
  );
}
