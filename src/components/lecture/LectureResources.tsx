import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  ExternalLink, 
  FileText, 
  FolderOpen, 
  Archive,
  Plus,
  Link as LinkIcon
} from 'lucide-react';
import DriveEmbedViewer from '../course/DriveEmbedViewer';

interface Resource {
  id: string;
  title: string;
  type: 'drive' | 'archive' | 'pdf' | 'link';
  url: string;
}

interface LectureResourcesProps {
  resources?: Resource[];
  lessonId: string;
  isEditable?: boolean;
}

const LectureResources: React.FC<LectureResourcesProps> = ({
  resources = [],
  lessonId,
  isEditable = false,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newResource, setNewResource] = useState({ title: '', url: '', type: 'link' as const });

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'drive': return <FolderOpen className="w-5 h-5 text-emerald-500" />;
      case 'archive': return <Archive className="w-5 h-5 text-amber-500" />;
      case 'pdf': return <FileText className="w-5 h-5 text-destructive" />;
      default: return <LinkIcon className="w-5 h-5 text-primary" />;
    }
  };

  const isDriveOrPdf = (url: string) => /drive\.google\.com/.test(url) || /\.pdf($|\?)/i.test(url);

  const sampleResources: Resource[] = resources.length > 0 ? resources : [
    { id: '1', title: 'Lecture Slides', type: 'drive', url: 'https://drive.google.com/file/d/example' },
    { id: '2', title: 'Additional Reading', type: 'archive', url: 'https://archive.org/details/example' },
    { id: '3', title: 'Practice Problems PDF', type: 'pdf', url: '/materials/practice.pdf' },
  ];

  const embeddableResources = sampleResources.filter(r => isDriveOrPdf(r.url));

  return (
    <div className="space-y-4">
      {embeddableResources.map((resource) => (
        <DriveEmbedViewer key={resource.id} url={resource.url} title={resource.title} />
      ))}

      <Card className="border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Additional Resources</CardTitle>
          {isEditable && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {showAddForm && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-2 mb-4">
              <Input
                placeholder="Resource title"
                value={newResource.title}
                onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
              />
              <Input
                placeholder="URL"
                value={newResource.url}
                onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setShowAddForm(false)}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
          
          {sampleResources.map((resource) => (
            <a
              key={resource.id}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
            >
              {getResourceIcon(resource.type)}
              <span className="flex-1 text-sm font-medium text-foreground">
                {resource.title}
              </span>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default LectureResources;
