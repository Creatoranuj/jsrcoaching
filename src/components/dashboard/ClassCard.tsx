import { cn } from "../../lib/utils";

interface ClassCardProps {
  grade: number;
  section?: string;
  onClick: () => void;
  variant?: "default" | "featured";
}

const ClassCard = ({ grade, section, onClick, variant = "default" }: ClassCardProps) => {
  const isFeatured = variant === "featured";

  return (
    <button
      onClick={onClick}
      className={cn(
        "p-6 rounded-2xl text-center transition-all duration-300 hover:scale-[1.02] hover:shadow-lg",
        isFeatured
          ? "col-span-2 bg-[image:var(--gradient-primary)] text-primary-foreground shadow-lg"
          : "bg-card border border-border text-foreground hover:border-primary/30"
      )}
    >
      <div className={cn(
        "text-3xl font-bold mb-1",
        !isFeatured && "text-primary"
      )}>
        {grade}
        <span className="text-base align-top">
          {grade === 1 ? "st" : grade === 2 ? "nd" : grade === 3 ? "rd" : "th"}
        </span>
      </div>
      <div className={cn(
        "text-sm",
        isFeatured ? "text-primary-foreground/80" : "text-muted-foreground"
      )}>
        {section ? `Section ${section}` : "Grade"}
      </div>
    </button>
  );
};

export default ClassCard;
