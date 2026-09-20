import { useLectureSchedules } from "../../hooks/useLectureSchedules";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Calendar, Clock, ExternalLink } from "lucide-react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";

/**
 * Placeholder that mirrors the real schedule row (title, course badge, meta
 * line, Join button) so the section keeps its height and nothing jumps when
 * the data arrives — a spinner here made the home screen look stuck.
 */
const ScheduleSkeleton = () => (
  <section aria-busy="true" aria-label="Loading upcoming schedule">
    <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
      <Calendar className="h-5 w-5 text-primary" />
      Upcoming Schedule
    </h2>
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <div className="flex items-center gap-3 pt-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-14" />
                </div>
              </div>
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </section>
);

const UpcomingSchedule = () => {
  const { upcomingSchedules, loading } = useLectureSchedules();

  // Show max 5 upcoming
  const upcoming = upcomingSchedules.slice(0, 5);

  if (loading) return <ScheduleSkeleton />;

  if (upcoming.length === 0) return null;

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "dd MMM");
  };

  return (
    <section>
      <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        Upcoming Schedule
      </h2>
      <div className="space-y-3">
        {upcoming.map((schedule) => (
          <Card key={schedule.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground line-clamp-1">{schedule.title}</h4>
                  {schedule.courseName && (
                    <Badge variant="outline" className="mt-1 text-xs">
                      {schedule.courseName}
                    </Badge>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {getDateLabel(schedule.scheduledDate)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {schedule.scheduledTime.slice(0, 5)}
                    </span>
                    {schedule.durationMinutes && (
                      <span>{schedule.durationMinutes} min</span>
                    )}
                  </div>
                </div>
                {schedule.meetingLink && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={schedule.meetingLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Join
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};

export default UpcomingSchedule;
