import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../integrations/supabase/client';
import { toast } from './use-toast';
import { logger } from "@/lib/logger";

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  cover_url: string;
  amazon_url: string;
  genre: string | null;
  position: number;
  click_count: number;
  created_at: string;
  updated_at: string;
}

export interface BookFormData {
  title: string;
  author: string;
  description: string;
  amazon_url: string;
  genre?: string;
}

const AFFILIATE_TAG = 'mahimaacademy-21';

function appendAffiliateTag(url: string): string {
  try {
    // Skip affiliate tag for amzn.to shortlinks (affiliate is embedded in redirect)
    if (url.includes('amzn.to')) return url;
    const urlObj = new URL(url);
    urlObj.searchParams.set('tag', AFFILIATE_TAG);
    return urlObj.toString();
  } catch {
    return url;
  }
}

export function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchBooks = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: dbError } = await supabase
        .from('books')
        .select('*')
        .order('position', { ascending: true });

      if (dbError) throw dbError;
      setBooks((data || []) as Book[]);
    } catch (err: any) {
      logger.error('Error fetching books:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const addBook = async ({ formData, coverFile }: { formData: BookFormData; coverFile: File }) => {
    try {
      setIsAdding(true);
      const fileName = `${Date.now()}-${coverFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('book-covers')
        .upload(fileName, coverFile);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('book-covers')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from('books')
        .insert({
          title: formData.title,
          author: formData.author,
          description: formData.description,
          amazon_url: appendAffiliateTag(formData.amazon_url),
          cover_url: publicUrlData.publicUrl,
          genre: formData.genre || null,
          position: books.length,
        });

      if (dbError) throw dbError;
      toast({ title: 'Book added' });
      await fetchBooks();
    } catch (err: any) {
      logger.error('Error adding book:', err);
      toast({ title: 'Failed to add book', variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const updateBook = async ({ id, formData, coverFile }: { id: string; formData: BookFormData; coverFile?: File }) => {
    try {
      setIsUpdating(true);
      const updateData: any = {
        title: formData.title,
        author: formData.author,
        description: formData.description,
        amazon_url: appendAffiliateTag(formData.amazon_url),
        genre: formData.genre || null,
      };

      if (coverFile) {
        const fileName = `${Date.now()}-${coverFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage
          .from('book-covers')
          .upload(fileName, coverFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('book-covers')
          .getPublicUrl(fileName);

        updateData.cover_url = publicUrlData.publicUrl;
      }

      const { error: dbError } = await supabase
        .from('books')
        .update(updateData)
        .eq('id', id);

      if (dbError) throw dbError;
      toast({ title: 'Book updated' });
      await fetchBooks();
    } catch (err: any) {
      logger.error('Error updating book:', err);
      toast({ title: 'Failed to update book', variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteBook = async (id: string) => {
    try {
      setIsDeleting(true);
      const { error: dbError } = await supabase
        .from('books')
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;
      toast({ title: 'Book deleted' });
      await fetchBooks();
    } catch (err: any) {
      logger.error('Error deleting book:', err);
      toast({ title: 'Failed to delete book', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const trackClick = async (bookId: string) => {
    try {
      await supabase.rpc('increment_book_clicks', { book_id: bookId });
    } catch (err) {
      logger.error('Error tracking click:', err);
    }
  };

  const updatePositions = async (orderedIds: string[]) => {
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await supabase.from('books').update({ position: i }).eq('id', orderedIds[i]);
      }
      await fetchBooks();
    } catch (err) {
      logger.error('Error updating positions:', err);
    }
  };

  return {
    books,
    isLoading,
    error,
    addBook,
    updateBook,
    deleteBook,
    updatePositions,
    trackClick,
    isAdding,
    isUpdating,
    isDeleting,
  };
}
