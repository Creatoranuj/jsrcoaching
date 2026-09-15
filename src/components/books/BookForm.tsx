/**
 * BookForm Component - Admin form for adding/editing books
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { Book, BookFormData } from '../../types/books';

const GENRES = [
  'Science',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'History',
  'Geography',
  'Literature',
  'Computer Science',
  'General Knowledge',
  'Competitive Exams',
  'Other'
];

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

const bookSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string().min(1, 'Author is required'),
  description: z.string()
    .min(1, 'Description is required')
    .max(300, 'Description must be 300 characters or less'),
  genre: z.string().optional(),
  amazon_url: z.string()
    .min(1, 'Amazon URL is required')
    .refine(
      (url) => url.includes('amazon.') || url.includes('amzn.to'),
      'Must be a valid Amazon or amzn.to URL'
    )
});

interface BookFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book?: Book | null;
  onSubmit: (data: BookFormData, coverFile?: File) => Promise<void>;
  isSubmitting?: boolean;
}

export function BookForm({ open, onOpenChange, book, onSubmit, isSubmitting }: BookFormProps) {
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<BookFormData>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      title: '',
      author: '',
      description: '',
      genre: '',
      amazon_url: ''
    }
  });

  const description = watch('description');

  useEffect(() => {
    return () => {
      if (coverPreview?.startsWith('blob:')) {
        try { URL.revokeObjectURL(coverPreview); } catch { /* noop */ }
      }
    };
  }, [coverPreview]);

  useEffect(() => {
    if (book) {
      reset({
        title: book.title,
        author: book.author,
        description: book.description,
        genre: book.genre || '',
        amazon_url: book.amazon_url
      });
      setCoverPreview(book.cover_url);
    } else {
      reset({
        title: '',
        author: '',
        description: '',
        genre: '',
        amazon_url: ''
      });
      setCoverFile(null);
      setCoverPreview(null);
    }
  }, [book, reset]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);

    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setFileError('Only JPG and PNG images are allowed');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError('Image must be 2MB or less');
      return;
    }

    setCoverFile(file);
    setCoverPreview((prev) => {
      if (prev?.startsWith('blob:')) {
        try { URL.revokeObjectURL(prev); } catch { /* noop */ }
      }
      return URL.createObjectURL(file);
    });
  };

  const handleFormSubmit = async (data: BookFormData) => {
    if (!book && !coverFile) {
      setFileError('Cover image is required');
      return;
    }
    await onSubmit(data, coverFile || undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{book ? 'Edit Book' : 'Add New Book'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* Cover Image */}
          <div className="space-y-2">
            <Label>Cover Image (JPG/PNG, max 2MB)</Label>
            <div className="flex items-start gap-4">
              <div className="w-24 h-36 bg-muted rounded-md overflow-hidden flex items-center justify-center border">
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleFileChange}
                  className="hidden"
                  id="cover-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('cover-upload')?.click()}
                  className="w-full gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {coverPreview ? 'Change Image' : 'Upload Image'}
                </Button>
                {coverPreview && !book && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCoverFile(null);
                      setCoverPreview(null);
                    }}
                    className="w-full gap-2 text-destructive"
                  >
                    <X className="h-4 w-4" />
                    Remove
                  </Button>
                )}
                {fileError && <p className="text-sm text-destructive">{fileError}</p>}
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" {...register('title')} placeholder="Enter book title" />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>

          {/* Author */}
          <div className="space-y-2">
            <Label htmlFor="author">Author *</Label>
            <Input id="author" {...register('author')} placeholder="Enter author name" />
            {errors.author && <p className="text-sm text-destructive">{errors.author.message}</p>}
          </div>

          {/* Genre */}
          <div className="space-y-2">
            <Label>Genre</Label>
            <Select onValueChange={(value) => setValue('genre', value)} defaultValue={book?.genre || ''}>
              <SelectTrigger>
                <SelectValue placeholder="Select a genre" />
              </SelectTrigger>
              <SelectContent>
                {GENRES.map((genre) => (
                  <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Description * ({description?.length || 0}/300)
            </Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Enter a brief description (max 300 characters)"
              rows={3}
              maxLength={300}
            />
            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
          </div>

          {/* Amazon URL */}
          <div className="space-y-2">
            <Label htmlFor="amazon_url">Amazon URL *</Label>
            <Input
              id="amazon_url"
              {...register('amazon_url')}
              placeholder="https://www.amazon.in/... or https://amzn.to/..."
              type="url"
            />
            {errors.amazon_url && <p className="text-sm text-destructive">{errors.amazon_url.message}</p>}
            <p className="text-xs text-muted-foreground">
              Affiliate tag will be added automatically
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : book ? 'Update Book' : 'Add Book'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
