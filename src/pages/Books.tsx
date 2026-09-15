/**
 * Books Page - Public display of recommended books with Amazon links
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBooks } from '../hooks/useBooks';
import { BooksGrid } from '../components/books/BooksGrid';
import { BookForm } from '../components/books/BookForm';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import type { Book, BookFormData } from '../types/books';
import logo from '../assets/branding/jsr-mark.webp';
import { toast } from 'sonner';

export default function Books() {
  // Screen protection removed for non-lesson pages; only LessonView blocks recording for students.
  const { isAuthenticated, isAdmin } = useAuth();
  const { books, isLoading, addBook, updateBook, deleteBook, trackClick, isAdding, isUpdating } = useBooks();
  
  const [formOpen, setFormOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleAddBook = async (data: BookFormData, coverFile?: File) => {
    if (!coverFile) {
      toast.error('Please upload a cover image');
      return;
    }
    await addBook({ formData: data, coverFile });
  };

  const handleUpdateBook = async (data: BookFormData, coverFile?: File) => {
    if (editingBook) {
      await updateBook({ id: editingBook.id, formData: data, coverFile });
      setEditingBook(null);
    }
  };

  const handleEdit = (book: Book) => {
    setEditingBook(book);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteBook(deleteId);
      setDeleteId(null);
    }
  };

  const handleBuyClick = (book: Book) => {
    trackClick(book.id);
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Public marketing nav — only for logged-out visitors. Authenticated users already have the app shell (top pill + bottom tab bar). */}
      {!isAuthenticated && (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border safe-area-top">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <img src={logo} alt="JSR COACHING" width={40} height={40} loading="eager" decoding="async" className="h-10 w-10 rounded-xl" />
              <span className="font-bold text-xl text-foreground hidden sm:inline">
                JSR COACHING
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Link to="/courses">
                <Button variant="ghost">Courses</Button>
              </Link>
              <Link to="/login">
                <Button>Login</Button>
              </Link>
            </div>
          </div>
        </nav>
      )}

      {/* Main Content — tight top padding for authenticated shell, generous for public nav */}
      <main className={isAuthenticated ? 'safe-area-top pt-6 sm:pt-8 pb-12' : 'pt-20 sm:pt-24 pb-12'}>
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2.5 sm:p-3 bg-primary/10 rounded-xl shrink-0">
                <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-3xl font-bold text-foreground leading-tight break-words">
                  Recommended Books
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Curated textbooks and study materials for your success
                </p>
              </div>
            </div>
            {isAdmin && (
              <Button onClick={() => { setEditingBook(null); setFormOpen(true); }} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Book
              </Button>
            )}
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-[2/3] rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No books yet</h2>
              <p className="text-muted-foreground mb-6">
                {isAdmin ? 'Start by adding your first book recommendation.' : 'Check back soon for book recommendations.'}
              </p>
              {isAdmin && (
                <Button onClick={() => setFormOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add First Book
                </Button>
              )}
            </div>
          ) : (
            <BooksGrid
              books={books}
              isAdmin={isAdmin}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteId(id)}
              onBuyClick={handleBuyClick}
            />
          )}
        </div>
      </main>

      {/* Book Form Dialog */}
      <BookForm
        open={formOpen}
        onOpenChange={setFormOpen}
        book={editingBook}
        onSubmit={editingBook ? handleUpdateBook : handleAddBook}
        isSubmitting={isAdding || isUpdating}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Book?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The book will be permanently removed from the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SEO Meta */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Recommended Books - JSR COACHING',
            description: 'Curated textbooks and study materials for students',
            url: window.location.href,
          })
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026'),
        }}
      />
    </div>
  );
}
