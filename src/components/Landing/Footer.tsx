import { useMemo, forwardRef } from "react";
import { Link } from "react-router-dom";
import { Mail, Phone, Shield, ArrowUpRight, Sparkles, Youtube } from "lucide-react";
import logoIcon from "../../assets/branding/jsr-mark.webp";
import { WHATSAPP_NUMBER } from "../common/WhatsAppButton";

const Footer = forwardRef<HTMLElement>((_, ref) => {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const phoneDisplay = "+91 73884 59249";

  const cols = [
    {
      title: "Learn",
      links: [
        { l: "All Courses", to: "/courses" },
        { l: "Class 9–10", to: "/courses" },
        { l: "Class 11–12", to: "/courses" },
        { l: "Live Classes", to: "/courses" },
      ],
    },
    {
      title: "Resources",
      links: [
        { l: "Free Books", to: "/books" },
        { l: "Notes Library", to: "/books" },
        { l: "Mock Tests", to: "/books" },
        { l: "Doubt Forum", to: "/doubts" },
      ],
    },
    {
      title: "Company",
      links: [
        { l: "About", to: "/" },
        { l: "Contact", to: "/" },
        { l: "Careers", to: "/" },
        { l: "Blog", to: "/" },
      ],
    },
    {
      title: "Legal",
      links: [
        { l: "Terms of Service", to: "/" },
        { l: "Privacy Policy", to: "/privacy" },
        { l: "Refund Policy", to: "/" },
        { l: "Delete Account", to: "/delete-account" },
      ],
    },
  ];

  return (
    <footer
      ref={ref}
      className="relative bg-secondary text-secondary-foreground border-t border-white/10 overflow-hidden"
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      {/* Ambient editorial gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, hsl(var(--primary) / 0.25), transparent 70%)",
        }}
      />

      {/* CTA band */}
      <div className="relative border-b border-white/10">
        <div className="container mx-auto max-w-7xl px-6 lg:px-10 py-10 md:py-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-secondary-foreground/60 mb-3">
              <Sparkles className="h-3 w-3" /> Learn with intent
            </div>
            <h3
              className="text-2xl md:text-3xl leading-tight"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Board exams ke liye serious prep. Serious results.
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition"
            >
              Start free <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              to="/courses"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm text-secondary-foreground/90 hover:bg-white/5 transition"
            >
              Browse courses
            </Link>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="relative container mx-auto max-w-7xl px-6 lg:px-10 py-16 md:py-20">
        <div className="grid lg:grid-cols-12 gap-12">
          {/* Brand — 4 cols */}
          <div className="lg:col-span-4 space-y-5">
            <div className="flex items-center gap-3">
              <img
                src={logoIcon}
                alt="JSR COACHING"
                className="h-11 w-11 rounded-full object-contain ring-1 ring-white/10 bg-white/5 p-1"
                width={44}
                height={44}
                loading="lazy"
              />
              <span
                className="font-serif text-xl tracking-tight"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                JSR COACHING
              </span>
            </div>
            <p className="text-sm text-secondary-foreground/60 leading-relaxed max-w-xs">
              Roz ek chhota kadam, bada change. Ramchandra Sir ke saath Class 9–12 board exam
              preparation — live classes, revision notes, mock tests aur doubt support — sab kuch app ke andar.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <a
                href="https://www.youtube.com/channel/UCJig1qwQQN3doNzobNDlB_A"
                target="_blank"
                rel="noopener noreferrer"
                className="h-11 w-11 rounded-lg bg-white/5 border border-white/10 hover:border-white/25 hover:scale-105 transition-all flex items-center justify-center"
                aria-label="Watch JSR COACHING on YouTube"
                title="Watch JSR COACHING on YouTube"
              >
                <Youtube aria-hidden="true" className="h-5 w-5 text-secondary-foreground" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-8">
            {cols.map((col) => (
              <div key={col.title}>
                <h4 className="font-medium text-[11px] uppercase tracking-[0.18em] text-secondary-foreground/80 mb-5">
                  {col.title}
                </h4>
                <ul className="space-y-3 text-sm">
                  {col.links.map((link) => (
                    <li key={link.l}>
                      <Link
                        to={link.to}
                        className="group inline-flex items-center gap-1 text-secondary-foreground/60 hover:text-secondary-foreground transition-colors"
                      >
                        <span>{link.l}</span>
                        <ArrowUpRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Contact strip */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-6">
            <a
              href="mailto:jsrcoachinginstitute@gmail.com"
              className="flex items-center gap-2 text-secondary-foreground/60 hover:text-secondary-foreground transition-colors"
            >
              <Mail className="h-4 w-4" />
              jsrcoachinginstitute@gmail.com
            </a>
            <a
              href={`tel:+${WHATSAPP_NUMBER}`}
              className="flex items-center gap-2 text-secondary-foreground/60 hover:text-secondary-foreground transition-colors"
            >
              <Phone className="h-4 w-4" />
              {phoneDisplay}
            </a>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-secondary-foreground/50 border border-white/10 rounded-full px-3 py-1.5 self-start md:self-auto">
            <Shield className="h-3 w-3" />
            <span>Razorpay Secure Payments</span>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="relative border-t border-white/10">
        <div className="container mx-auto max-w-7xl px-6 lg:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-secondary-foreground/40">
            © {currentYear} JSR COACHING. All rights reserved.
          </p>
          <p className="text-xs text-secondary-foreground/40">
            Made with care for Indian students.
          </p>
        </div>
      </div>
    </footer>
  );
});

Footer.displayName = "Footer";
export default Footer;
