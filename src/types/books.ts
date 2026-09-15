/**
 * Book Types for the Books Section
 */

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
  genre: string;
  amazon_url: string;
  cover_file?: File;
}

export type BookSortOption = 'newest' | 'oldest' | 'title' | 'author';
