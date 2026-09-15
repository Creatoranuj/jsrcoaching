import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { FileText, BookOpen, MessageSquare, FolderOpen } from 'lucide-react';

interface LectureTabsProps {
  children: {
    overview: React.ReactNode;
    resources: React.ReactNode;
    notes: React.ReactNode;
    discussion: React.ReactNode;
  };
  defaultTab?: string;
}

const LectureTabs: React.FC<LectureTabsProps> = ({
  children,
  defaultTab = 'overview',
}) => {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="w-full grid grid-cols-4 bg-muted/50 rounded-none border-b border-border">
        <TabsTrigger 
          value="overview" 
          className="flex items-center gap-1.5 text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
        >
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger 
          value="resources"
          className="flex items-center gap-1.5 text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
        >
          <FolderOpen className="w-4 h-4" />
          <span className="hidden sm:inline">Resources</span>
        </TabsTrigger>
        <TabsTrigger 
          value="notes"
          className="flex items-center gap-1.5 text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
        >
          <BookOpen className="w-4 h-4" />
          <span className="hidden sm:inline">Notes</span>
        </TabsTrigger>
        <TabsTrigger 
          value="discussion"
          className="flex items-center gap-1.5 text-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden sm:inline">Discussion</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-0 p-4">
        {children.overview}
      </TabsContent>
      
      <TabsContent value="resources" className="mt-0 p-4">
        {children.resources}
      </TabsContent>
      
      <TabsContent value="notes" className="mt-0 p-4">
        {children.notes}
      </TabsContent>
      
      <TabsContent value="discussion" className="mt-0 p-4">
        {children.discussion}
      </TabsContent>
    </Tabs>
  );
};

export default LectureTabs;
