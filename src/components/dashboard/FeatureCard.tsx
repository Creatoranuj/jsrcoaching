import { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

interface FeatureCardProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  color?: "primary" | "secondary" | "accent" | "success";
}

const colorClasses = {
  primary: "text-primary bg-primary/10",
  secondary: "text-secondary bg-secondary/10",
  accent: "text-accent bg-accent/10",
  success: "text-success bg-success/10",
};

const FeatureCard = ({ icon: Icon, label, onClick, color = "primary" }: FeatureCardProps) => {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-3 p-5 bg-card border border-border rounded-2xl transition-all duration-300 hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5"
    >
      <div className={cn("p-3 rounded-xl", colorClasses[color])}>
        <Icon className="h-7 w-7" />
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
};

export default FeatureCard;
