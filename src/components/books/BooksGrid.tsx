/**
 * BooksGrid Component - Displays books in a responsive grid with filters
 */

import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { BookCard } from './BookCard';
import type { Book, BookSortOption } from '../../types/books';

interface BooksGridProps {
  books: Book[];
  isAdmin?: boolean;
  onEdit?: (book: Book) => void;
  onDelete?: (id: string) => void;
  onBuyClick?: (book: Book) => void;
}

export function BooksGrid({ books, isAdmin, onEdit, onDelete, onBuyClick }: BooksGridProps) {
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<BookSortOption>('newest');
  const [showFilters, setShowFilters] = useState(false);

  // Get unique genres
  const genres = useMemo(() => {
    const uniqueGenres = new Set(books.map(b => b.genre).filter(Boolean));
    return Array.from(uniqueGenres) as string[];
  }, [books]);

  // Filter and sort books
  const filteredBooks = useMemo(() => {
    let result = [...books];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        book =>
          book.title.toLowerCase().includes(searchLower) ||
          book.author.toLowerCase().includes(searchLower)
      );
    }

    // Genre filter
    if (genreFilter && genreFilter !== 'all') {
      result = result.filter(book => book.genre === genreFilter);
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'title':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'author':
        result.sort((a, b) => a.author.localeCompare(b.author));
        break;
    }

    return result;
  }, [books, search, genreFilter, sortBy]);

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search books by title or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className="sm:hidden gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </Button>
        <div className={`flex gap-2 ${showFilters ? 'flex' : 'hidden sm:flex'}`}>
          <Select value={genreFilter} onValueChange={setGenreFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Genre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Genres</SelectItem>
              {genres.map((genre) => (
                <SelectItem key={genre} value={genre}>{genre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as BookSortOption)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="title">By Title</SelectItem>
              <SelectItem value="author">By Author</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredBooks.length} of {books.length} books
      </p>

      {/* Grid */}
      {filteredBooks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No books found matching your criteria.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {filteredBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onDelete={onDelete}
              onBuyClick={onBuyClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
