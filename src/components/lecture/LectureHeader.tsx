import React from 'react';
import { ArrowLeft, Clock, Star } from 'lucide-react';
import { Badge } from '../ui/badge';
import { formatDuration } from '../video/MahimaVideoPlayer';

interface LectureHeaderProps {
  courseName: string;
  grade: string;
  lessonCount: number;
  onBack?: () => void;
}

const LectureHeader: React.FC<LectureHeaderProps> = ({
  courseName,
  grade,
  lessonCount,
  onBack,
}) => {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background sticky top-0 z-50 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
      <button 
        onClick={onBack}
        aria-label="Go back"
        className="min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-accent rounded-full transition-colors"
      >

        <ArrowLeft className="w-5 h-5 text-foreground" />
      </button>
      
      <div className="flex-1 min-w-0">
        <h1 className="font-semibold text-foreground truncate">{courseName}</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary" className="text-xs">{grade}</Badge>
          <span>• {lessonCount} Lessons</span>
        </div>
      </div>
    </div>
  );
};

interface LessonTitleProps {
  title: string;
  duration: number; // in seconds
  rating?: number;
}

export const LessonTitle: React.FC<LessonTitleProps> = ({
  title,
  duration,
  rating = 4.8,
}) => {
  return (
    <div className="px-4 py-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          <span>{formatDuration(duration)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 fill-primary text-primary" />
          <span>{rating} Rating</span>
        </div>
      </div>
    </div>
  );
};

export default LectureHeader;
