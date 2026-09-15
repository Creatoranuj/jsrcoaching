import { cn } from "../../lib/utils";

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  showLabel?: boolean;
  color?: "primary" | "success" | "warning";
}

const colorMap = {
  primary: "bg-primary",
  success: "bg-green-500",
  warning: "bg-yellow-500",
};

export const ProgressBar = ({ 
  value, 
  className, 
  showLabel = false,
  color = "success"
}: ProgressBarProps) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showLabel && (
        <span className="text-sm text-muted-foreground min-w-[40px]">
          {Math.round(clampedValue)}%
        </span>
      )}
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", colorMap[color])}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
