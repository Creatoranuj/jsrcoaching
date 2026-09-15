import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Link,
  Save,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useToast } from '../../hooks/use-toast';
import DOMPurify from 'dompurify';

interface ObsidianNotesProps {
  lessonId: string;
  userId?: string;
  lessonTitle?: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ── Hoisted outside component — stable reference, no recreation on re-render ─
const SaveStatusIndicator = ({ status }: { status: SaveStatus }) => {
  if (status === 'idle') return null;
  if (status === 'saving') return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Loader2 className="w-3 h-3 animate-spin" />
      Saving...
    </span>
  );
  if (status === 'saved') return (
    <span className="flex items-center gap-1 text-xs text-primary">
      <CheckCircle className="w-3 h-3" />
      Saved ✓
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="w-3 h-3" />
      Save failed
    </span>
  );
};

const ObsidianNotes: React.FC<ObsidianNotesProps> = ({
  lessonId,
  userId,
  lessonTitle = 'Untitled Lesson',
}) => {
  const [markdown, setMarkdown] = useState('');
  const [isEditing, setIsEditing] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad = useRef(true);

  // Load existing notes
  useEffect(() => {
    const loadNotes = async () => {
      if (!userId || !lessonId) return;
      
      const { data } = await supabase
        .from('lecture_notes')
        .select('markdown')
        .eq('lesson_id', lessonId)
        .eq('user_id', userId)
        .single();
      
      if (data) {
        setMarkdown(data.markdown);
      } else {
        setMarkdown(generateTemplate(lessonTitle));
      }
      isFirstLoad.current = false;
    };

    isFirstLoad.current = true;
    loadNotes();
  }, [lessonId, userId, lessonTitle]);

  const generateTemplate = (title: string): string => {
    return `# ${title}

## 📋 Key Concepts
- 

## 📝 Notes
- 

## 💡 Important Points
> [!note] Remember
> 

## 🔗 Related Topics
- [[Topic 1]]
- [[Topic 2]]

## ❓ Questions
- 

---
*Last updated: ${new Date().toLocaleDateString()}*
`;
  };

  const performSave = useCallback(async (text: string) => {
    if (!userId) return;
    setSaveStatus('saving');

    const { error } = await supabase
      .from('lecture_notes')
      .upsert({
        lesson_id: lessonId,
        user_id: userId,
        markdown: text,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'lesson_id,user_id',
      });

    if (error) {
      setSaveStatus('error');
    } else {
      setSaveStatus('saved');
      // Auto-reset "Saved ✓" after 3 seconds
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [lessonId, userId]);

  const handleMarkdownChange = (value: string) => {
    setMarkdown(value);

    // Skip debounce on initial load
    if (isFirstLoad.current) return;
    if (!userId) return;

    // Debounce auto-save: 1.5s after last keystroke
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(() => {
      performSave(value);
    }, 1500);
  };

  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = document.getElementById('notes-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = markdown.substring(start, end);
    const newText = markdown.substring(0, start) + before + selectedText + after + markdown.substring(end);
    
    handleMarkdownChange(newText);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  const saveNotes = async () => {
    if (!userId) {
      toast({
        title: 'Login Required',
        description: 'Please login to save your notes',
        variant: 'destructive',
      });
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await performSave(markdown);
    toast({ title: 'Notes saved!', description: 'Your notes have been saved successfully' });
  };

  const autoGenerateNotes = () => {
    const template = `# ${lessonTitle}

## 📋 Summary
- Main topic covered in this lecture
- Key definitions and concepts

## 📝 Detailed Notes

### Section 1: Introduction
- Point 1
- Point 2

### Section 2: Core Concepts
- Concept A
  - Sub-point
  - Sub-point
- Concept B

### Section 3: Examples
1. Example 1
2. Example 2
3. Example 3

## 💡 Key Takeaways
> [!important]
> Remember these key points from the lecture

- Takeaway 1
- Takeaway 2
- Takeaway 3

## 🔗 Backlinks
- [[Previous Lesson]]
- [[Related Topic]]
- [[Next Lesson]]

## ❓ Review Questions
1. Question 1?
2. Question 2?
3. Question 3?

---
📅 Date: ${new Date().toLocaleDateString()}
⏱️ Duration: See video player
`;
    handleMarkdownChange(template);
    toast({
      title: 'Template Generated',
      description: 'Obsidian-style notes template has been created',
    });
  };

  const renderMarkdown = (text: string): string => {
    const sanitizedInput = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    
    let html = sanitizedInput
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/>\s*\[!(\w+)\]\s*(.*)/g, '<div class="p-3 my-2 rounded-lg bg-primary/10 border-l-4 border-primary"><span class="font-semibold text-primary">$1:</span> $2</div>')
      .replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-muted-foreground/30 pl-4 italic my-2">$1</blockquote>')
      .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>')
      .replace(/\[\[(.*?)\]\]/g, '<span class="text-primary bg-primary/10 px-1 rounded cursor-pointer hover:underline">[[$1]]</span>')
      .replace(/`(.*?)`/g, '<code class="bg-muted px-1 rounded text-sm">$1</code>')
      .replace(/^---$/gm, '<hr class="my-4 border-border">')
      .replace(/\n/g, '<br>');

    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'strong', 'em', 'div', 'span', 'blockquote', 'li', 'code', 'hr', 'br'],
      ALLOWED_ATTR: ['class'],
    });
  };

  // SaveStatusIndicator is defined outside component (see below) and receives saveStatus as prop

  return (
    <div className="space-y-4">
      <Card className="border-border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-5 h-5" />
            My Notes
          </CardTitle>
          <div className="flex items-center gap-2">
            <SaveStatusIndicator status={saveStatus} />
            <Button
              variant="outline"
              size="sm"
              onClick={autoGenerateNotes}
              className="gap-1"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Template</span>
            </Button>
            <Button
              size="sm"
              onClick={saveNotes}
              disabled={saveStatus === 'saving'}
              className="gap-1"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Formatting Toolbar */}
          <div className="flex flex-wrap gap-1 mb-3 p-2 bg-muted/50 rounded-lg">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('**', '**')}>
              <Bold className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('*', '*')}>
              <Italic className="w-4 h-4" />
            </Button>
            <div className="w-px h-8 bg-border mx-1" />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('# ')}>
              <Heading1 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('## ')}>
              <Heading2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('### ')}>
              <Heading3 className="w-4 h-4" />
            </Button>
            <div className="w-px h-8 bg-border mx-1" />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('- ')}>
              <List className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('1. ')}>
              <ListOrdered className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('> ')}>
              <Quote className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('`', '`')}>
              <Code className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('[[', ']]')}>
              <Link className="w-4 h-4" />
            </Button>
          </div>

          {/* Toggle between Edit and Preview */}
          <div className="flex gap-2 mb-3">
            <Button 
              variant={isEditing ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
            <Button 
              variant={!isEditing ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setIsEditing(false)}
            >
              Preview
            </Button>
          </div>

          {/* Editor or Preview */}
          {isEditing ? (
            <Textarea
              id="notes-textarea"
              value={markdown}
              onChange={(e) => handleMarkdownChange(e.target.value)}
              placeholder="Start taking notes... Use Markdown formatting"
              className="min-h-[300px] font-mono text-sm resize-y"
            />
          ) : (
            <div
              className="flexoki min-h-[300px] prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ObsidianNotes;
