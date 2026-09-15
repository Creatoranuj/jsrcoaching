import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Play, Clock, CheckCircle } from 'lucide-react';
import { formatDuration } from '../video/MahimaVideoPlayer';

interface Lesson {
  id: string;
  title: string;
  duration: number; // seconds
  isCompleted?: boolean;
  isCurrent?: boolean;
}

interface CourseContentProps {
  lessons: Lesson[];
  completedCount: number;
  onLessonClick?: (lessonId: string) => void;
}

const CourseContent: React.FC<CourseContentProps> = ({
  lessons,
  completedCount,
  onLessonClick,
}) => {
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;

  return (
    <Card className="border-border mt-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Course Content</CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{lessons.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {progressPercent.toFixed(0)}% Completed
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-1 pt-2">
        {lessons.map((lesson) => (
          <button
            key={lesson.id}
            onClick={() => onLessonClick?.(lesson.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
              lesson.isCurrent
                ? 'bg-primary/10 border border-primary/30'
                : 'hover:bg-muted/50'
            }`}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              lesson.isCompleted 
                ? 'bg-green-500/20 text-green-500'
                : lesson.isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
            }`}>
              {lesson.isCompleted ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${
                lesson.isCurrent ? 'text-primary' : 'text-foreground'
              }`}>
                {lesson.title}
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{formatDuration(lesson.duration)}</span>
              </div>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
};

export default CourseContent;
