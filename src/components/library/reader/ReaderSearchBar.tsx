import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";
import { Button } from "../../ui/button";
import { selectionHaptic } from "../../../lib/native/haptics";

interface Props {
  /** Runs the search and resolves with the 1-based pages that contain the text. */
  onSearch: (query: string) => Promise<number[]>;
  /** Scroll a 1-based page into view. */
  onJump: (page: number) => void;
  onClose: () => void;
  /** Extra bottom offset (px) so the soft keyboard never covers the field. */
  topOffset: number;
}

/**
 * In-reader text search for the canvas PDF reader.
 *
 * pdf.js' own `findController` is not reachable through react-pdf, so we scan
 * page text via `getTextContent()` (cached per page inside FastPdfReader) and
 * jump between the pages that match. Mobile-first: 44px targets, 16px input
 * font so iOS never zooms the viewport on focus.
 */
export default function ReaderSearchBar({ onSearch, onJump, onClose, topOffset }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      aliveRef.current = false;
      window.clearTimeout(t);
    };
  }, []);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const hits = await onSearch(q);
      if (!aliveRef.current) return;
      setMatches(hits);
      setSearched(true);
      setIndex(0);
      if (hits.length) onJump(hits[0]);
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }, [busy, onJump, onSearch, query]);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (!matches.length) return;
      void selectionHaptic();
      const next = (index + delta + matches.length) % matches.length;
      setIndex(next);
      onJump(matches[next]);
    },
    [index, matches, onJump],
  );

  return (
    <div
      className="absolute inset-x-0 z-50 border-b bg-card/95 px-2 py-2 shadow-sm backdrop-blur"
      style={{ top: `${topOffset}px` }}
      onClick={(e) => e.stopPropagation()}
      role="search"
    >
      <div className="flex items-center gap-1">
        <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearched(false);
            setMatches([]);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (searched && matches.length) step(1);
              else void run();
            }
            if (e.key === "Escape") onClose();
          }}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Search in document"
          aria-label="Search in document"
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
        />
        <span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {busy ? "…" : searched ? (matches.length ? `${index + 1}/${matches.length}` : "0/0") : ""}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label="Previous match"
          disabled={!matches.length}
          onClick={() => step(-1)}
        >
          <ChevronUp className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label={searched ? "Next match" : "Search"}
          onClick={() => (searched && matches.length ? step(1) : void run())}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronDown className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Close search" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      {searched && !busy && !matches.length && (
        <p className="px-3 pb-1 pt-0.5 text-xs text-muted-foreground">No matches in this document.</p>
      )}
    </div>
  );
}
