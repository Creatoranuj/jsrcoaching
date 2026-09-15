import React from 'react';
import { Card, CardContent } from '../ui/card';
import { CheckCircle } from 'lucide-react';

interface LectureOverviewProps {
  description?: string;
  learningPoints?: string[];
  lessonTitle: string;
}

const LectureOverview: React.FC<LectureOverviewProps> = ({
  description = 'Video - JSR COACHING',
  learningPoints = [
    'Basic definitions',
    'Real-world examples',
    'Problem solving',
  ],
  lessonTitle,
}) => {
  return (
    <div className="space-y-4">
      <Card className="border-border">
        <CardContent className="p-4">
          <h3 className="font-semibold text-foreground mb-2">About this lesson</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
          
          <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-primary font-medium">
                  You will learn: {learningPoints.join(', ')}.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LectureOverview;
