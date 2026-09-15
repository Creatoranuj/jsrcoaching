/**
 * BookCard Component - Displays a single book with cover, info, and Amazon link
 */

import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { SmartImage } from '../common/SmartImage';
import type { Book } from '../../types/books';
import { openResource } from '../../lib/openResource';

interface BookCardProps {
  book: Book;
  isAdmin?: boolean;
  onEdit?: (book: Book) => void;
  onDelete?: (id: string) => void;
  onBuyClick?: (book: Book) => void;
}

export function BookCard({ book, isAdmin, onEdit, onDelete, onBuyClick }: BookCardProps) {
  const handleBuyClick = () => {
    onBuyClick?.(book);
    void openResource({ url: book.amazon_url, kind: 'link' });
  };

  return (
    <Card className="nb-tap group overflow-hidden transition-shadow [@media(hover:hover)]:hover:shadow-lg">
      <div className="aspect-[2/3] relative overflow-hidden bg-muted">
        <SmartImage
          src={book.cover_url}
          alt={`${book.title} cover`}
          width={400}
          height={600}
          className="h-full w-full object-cover transition-transform [@media(hover:hover)]:group-hover:scale-105"
        />
        {book.genre && (
          <Badge className="absolute top-2 left-2 bg-primary/90">
            {book.genre}
          </Badge>
        )}
        {isAdmin && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9"
              aria-label={`Edit ${book.title}`}
              onClick={() => onEdit?.(book)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-9 w-9"
              aria-label={`Delete ${book.title}`}
              onClick={() => onDelete?.(book.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-foreground line-clamp-2 leading-tight">
            {book.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">by {book.author}</p>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-3">
          {book.description}
        </p>
        <Button
          onClick={handleBuyClick}
          className="w-full gap-2 bg-brand-accent hover:bg-brand-accent-hover text-brand-accent-foreground font-semibold min-h-[44px]"
        >
          <ExternalLink className="h-4 w-4" />
          Buy on Amazon
        </Button>
      </CardContent>

      {/* SEO: Schema.org structured data — escape </script> and HTML brackets to prevent stored XSS */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Book',
            name: book.title,
            author: { '@type': 'Person', name: book.author },
            description: book.description,
            image: book.cover_url,
            url: book.amazon_url,
          })
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029'),
        }}
      />
    </Card>
  );
}
