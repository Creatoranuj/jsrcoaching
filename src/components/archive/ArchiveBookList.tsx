/**
 * Archive Book List Component
 * Displays a list of Archive.org books for a lesson with lazy loading
 */

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Plus, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { ArchiveBookReader } from './ArchiveBookReader';
import { cn } from '../../lib/utils';

export interface ArchiveBook {
  id: string;
  identifier: string;
  title?: string;
  description?: string;
}

interface ArchiveBookListProps {
  books: ArchiveBook[];
  isAdmin?: boolean;
  onAddBook?: (book: Omit<ArchiveBook, 'id'>) => void;
  onRemoveBook?: (id: string) => void;
  className?: string;
}

export function ArchiveBookList({
  books,
  isAdmin = false,
  onAddBook,
  onRemoveBook,
  className,
}: ArchiveBookListProps) {
  const [expandedBook, setExpandedBook] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newBook, setNewBook] = useState({
    identifier: '',
    title: '',
    description: '',
  });

  const handleAddBook = () => {
    if (!newBook.identifier.trim()) return;
    
    onAddBook?.({
      identifier: newBook.identifier.trim(),
      title: newBook.title.trim() || undefined,
      description: newBook.description.trim() || undefined,
    });
    
    setNewBook({ identifier: '', title: '', description: '' });
    setIsAddDialogOpen(false);
  };

  const extractIdentifier = (input: string): string => {
    // Handle full URLs like https://archive.org/details/identifier
    const match = input.match(/archive\.org\/details\/([^/?#]+)/);
    return match ? match[1] : input;
  };

  if (books.length === 0 && !isAdmin) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-1">
            No Reference Books
          </h3>
          <p className="text-sm text-muted-foreground">
            No Archive.org books have been added to this lesson yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Admin Add Button */}
      {isAdmin && onAddBook && (
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Add Archive.org Book
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Archive.org Book</DialogTitle>
              <DialogDescription>
                Enter the Archive.org book identifier or URL to embed it in this lesson.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Archive.org Identifier or URL *</Label>
                <Input
                  id="identifier"
                  placeholder="e.g., theworksofplato01444gut or full URL"
                  value={newBook.identifier}
                  onChange={(e) => setNewBook(prev => ({
                    ...prev,
                    identifier: extractIdentifier(e.target.value)
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Find books at{' '}
                  <a 
                    href="https://archive.org/details/texts" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    archive.org/details/texts
                    <ExternalLink className="h-3 w-3 inline ml-1" />
                  </a>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Custom Title (optional)</Label>
                <Input
                  id="title"
                  placeholder="Override the book title"
                  value={newBook.title}
                  onChange={(e) => setNewBook(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  placeholder="Brief description for students"
                  value={newBook.description}
                  onChange={(e) => setNewBook(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddBook} disabled={!newBook.identifier.trim()}>
                Add Book
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Book List */}
      {books.length === 0 && isAdmin ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              Click "Add Archive.org Book" to embed reference materials
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {books.map((book) => (
            <Collapsible
              key={book.id}
              open={expandedBook === book.id}
              onOpenChange={(open) => setExpandedBook(open ? book.id : null)}
            >
              <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <BookOpen className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">
                          {book.title || book.identifier}
                        </h4>
                        {book.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {book.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && onRemoveBook && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveBook(book.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {expandedBook === book.id ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t">
                    <ArchiveBookReader
                      identifier={book.identifier}
                      title={book.title}
                      description={book.description}
                      height={450}
                      className="border-0 shadow-none rounded-none"
                    />
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}

export default ArchiveBookList;
