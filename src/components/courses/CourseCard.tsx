import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { BookOpen, Clock, Star, CheckCircle, PlayCircle, Lock } from "lucide-react";
import { SmartImage } from "../common/SmartImage";
import { cn } from "../../lib/utils";
import { formatGrade } from "../../lib/formatGrade";

import coursePlaceholder from "../../assets/thumbnails/course-default.svg";

// ✅ Type Definitions
export interface CourseProps {
  id: number;
  title: string;
  description: string;
  price: number;
  grade: string | number;
  image_url: string;
  rating?: number;
  duration?: string;
  lessons_count?: number;
}

interface CourseCardProps {
  course: CourseProps;
  onClick?: () => void;
  isAdmin?: boolean;
  onAdminEnroll?: (courseId: number) => Promise<any>;
  isEnrolling?: boolean;
  isEnrolled?: boolean;
  onEnrollFree?: () => void;
}

const CourseCard = ({ course, onClick, isAdmin, onAdminEnroll, isEnrolling, isEnrolled, onEnrollFree }: CourseCardProps) => {
  const handleClick = async () => {
    // Admin bypass for paid courses
    if (isAdmin && course.price > 0 && onAdminEnroll) {
      await onAdminEnroll(course.id);
      return;
    }
    // Regular click handler
    onClick?.();
  };

  const ctaLabel = isEnrolling
    ? "Enrolling..."
    : isAdmin && course.price > 0
    ? "Admin Access"
    : isEnrolled
    ? "Continue"
    : course.price === 0
    ? "Start Learning"
    : "Buy Course";

  return (
    <div
      className={cn(
        "nb-tap group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm",
        "transition-all duration-300 hover:shadow-md hover:border-primary/30 active:scale-[0.99]"
      )}
    >
      {/* Cover — 16:9 with gradient veil + floating pills */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        <SmartImage
          src={course.image_url || coursePlaceholder}
          alt={course.title}
          width={600}
          height={338}
          fallbackSrc={coursePlaceholder}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        {/* Gradient veil for text/badge legibility */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

        {/* Top row — grade on the left, status chips on the right.
            One flex row so the chips can never overlap on narrow cards. */}
        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
          {course.grade ? (
            <Badge
              variant="secondary"
              className="h-6 min-w-0 max-w-[55%] shrink rounded-full border-0 bg-background/85 px-2 text-[10px] font-semibold text-foreground backdrop-blur-md"
            >
              <span className="truncate">{formatGrade(course.grade, "Grade")}</span>
            </Badge>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {course.price === 0 && (
              <Badge className="h-6 rounded-full bg-emerald-500/95 px-2 text-[10px] font-semibold text-white shadow-sm">
                FREE
              </Badge>
            )}
            {isEnrolled && (
              <Badge className="h-6 gap-1 rounded-full bg-primary/95 px-2 text-[10px] font-semibold text-primary-foreground shadow-sm">
                <CheckCircle className="h-3 w-3" />
                Enrolled
              </Badge>
            )}
          </div>
        </div>

        {/* Bottom row — lessons pill and rating pill share one row */}
        <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-1.5">
          {isEnrolled || course.price === 0 ? (
            <div className="inline-flex min-w-0 items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <PlayCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{course.lessons_count || 0} Lessons</span>
            </div>
          ) : (
            <span />
          )}
          <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {course.rating || "4.5"}
          </div>
        </div>

      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-1 text-[15px] font-semibold text-foreground">{course.title}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">
          {course.description || "No description provided."}
        </p>

        {/* Meta row */}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/8 px-2 py-1 text-primary/90">
            <BookOpen className="h-3 w-3" />
            {course.lessons_count || 0} Lessons
          </span>
          {course.duration && course.duration !== "0m" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-1 text-foreground/80">
              <Clock className="h-3 w-3" />
              {course.duration}
            </span>
          )}
        </div>

        {/* Footer: price + CTA */}
        <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border/60">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-primary">
              {course.price === 0 ? "Free" : `₹${course.price}`}
            </span>
            {course.price > 0 && !isEnrolled && (
              <span className="text-[10px] font-medium text-muted-foreground">one-time</span>
            )}
          </div>
          <div className="flex gap-2">
            {course.price === 0 && !isEnrolled && onEnrollFree && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onEnrollFree();
                }}
                className="h-10 rounded-xl px-3 text-xs font-semibold active:scale-[0.97] transition-transform duration-150"
              >
                Enroll
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleClick}
              disabled={isEnrolling}
              className={cn(
                "h-10 rounded-xl px-4 text-xs font-semibold shadow-sm active:scale-[0.97] transition-transform duration-150",
                isEnrolled
                  ? "bg-primary/90 hover:bg-primary text-primary-foreground"
                  : course.price === 0
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {!isEnrolled && course.price > 0 && <Lock className="mr-1 h-3 w-3" />}
              {ctaLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseCard;
