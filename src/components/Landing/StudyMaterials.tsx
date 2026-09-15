import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import Picture from "../ui/Picture";
import materialsImage from "../../assets/landing/study-materials.jpg";
import materialsImageWebp from "../../assets/landing/study-materials.webp";
import materialsImageAvif from "../../assets/landing/study-materials.avif";

const resources = [
  { tag: "Notes", title: "Class 9–12 Board Notes", desc: "Chapter-wise summaries, important questions aur exam-ready practice sets." },
  { tag: "Practice", title: "Previous Year Question Bank", desc: "Board exam ke solved papers aur marking scheme ke hisaab se answers." },
  { tag: "Mock Tests", title: "Full Syllabus Mock Tests", desc: "Timed mock papers, detailed analysis aur topic-wise scoring." },
];

const StudyMaterials = memo(() => (
  <section className="py-16 md:py-20 bg-background">
    <div className="container mx-auto max-w-5xl px-5 md:px-8">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
          Premium Study Materials
        </h2>
        <p className="mt-3 text-base md:text-lg text-muted-foreground">
          Notes, question bank aur mock tests — bilkul free.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {resources.map((r) => (
          <Link
            key={r.title}
            to="/books"
            className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              {r.tag}
            </span>
            <h3 className="mt-4 text-lg font-bold text-foreground leading-snug">{r.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{r.desc}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-card shadow-sm grid md:grid-cols-2">
        <Picture
          srcAvif={materialsImageAvif}
          srcWebp={materialsImageWebp}
          srcFallback={materialsImage}
          alt="Notes, practice papers aur tablet ke saath study desk"
          width={1280}
          height={800}
          pictureClassName="block h-full w-full"
          className="w-full h-full object-cover aspect-[16/10]"
        />
        <div className="p-8 flex flex-col justify-center gap-4">
          <h3 className="text-2xl font-extrabold text-foreground leading-tight">
            Sab resources ek jagah, bilkul free
          </h3>
          <p className="text-muted-foreground">
            PDF notes download karein, app mein hi padhein aur test dekar apni taiyari check karein.
          </p>
          <Link to="/books" className="self-start">
            <Button size="lg" className="rounded-xl font-bold gap-2">
              Browse Resources <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  </section>
));

StudyMaterials.displayName = "StudyMaterials";
export default StudyMaterials;
