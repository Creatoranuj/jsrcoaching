import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "../../lib/utils";

interface QuizTimerProps {
  totalSeconds: number;
  onTimeUp: () => void;
  onTick?: (remaining: number) => void;
}

const QuizTimer = ({ totalSeconds, onTimeUp, onTick }: QuizTimerProps) => {
  const [remaining, setRemaining] = useState(totalSeconds);
  // Refs forward the latest callbacks so the once-mounted interval below
  // never captures a stale `onTimeUp` that closes over empty quiz answers.
  const onTimeUpRef = useRef(onTimeUp);
  const onTickRef = useRef(onTick);
  useEffect(() => { onTimeUpRef.current = onTimeUp; }, [onTimeUp]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  useEffect(() => {
    if (remaining <= 0) {
      onTimeUpRef.current();
      return;
    }
    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        onTickRef.current?.(next);
        if (next <= 0) {
          clearInterval(interval);
          onTimeUpRef.current();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isWarning = remaining <= 300; // 5 minutes warning
  const isCritical = remaining <= 60;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-mono font-semibold border",
        isCritical
          ? "bg-destructive/10 text-destructive border-destructive/30 animate-pulse"
          : isWarning
          ? "bg-orange-500/10 text-orange-600 border-orange-500/30"
          : "bg-primary/10 text-primary border-primary/20"
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </div>
  );
};

export default QuizTimer;
