# Caching & pagination

Trimmed columns still cost bandwidth if the same query re-runs on every mount/focus. Cache aggressively; paginate always.

## React Query defaults (project-wide)

Confirm in `src/main.tsx` or wherever `QueryClient` is instantiated:

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,      // 5 min — data considered fresh, no refetch
      gcTime: 30 * 60_000,        // 30 min — keep cache in memory
      refetchOnWindowFocus: false, // huge saver on mobile browser tab-switches
      refetchOnMount: false,       // don't refetch if data is still fresh
      retry: 1,
    },
  },
});
```

Override per-query only when data must be near-real-time (e.g. live session participants — use realtime instead, not polling).

## Pagination — enforce always

Every list query MUST have `.limit()` or `.range()`. Default page size 20–50.

```ts
// Fixed page
.select('...').limit(30)

// Infinite scroll — preferred for lecture/course lists
import { useInfiniteQuery } from '@tanstack/react-query';

useInfiniteQuery({
  queryKey: ['lessons', courseId],
  queryFn: async ({ pageParam = 0 }) => {
    const from = pageParam * 20;
    const to = from + 19;
    const { data } = await supabase
      .from('lessons')
      .select('id, title, thumbnail_url, duration_seconds')
      .eq('course_id', courseId)
      .order('order_index')
      .range(from, to);
    return data ?? [];
  },
  getNextPageParam: (last, all) => (last.length === 20 ? all.length : undefined),
  initialPageParam: 0,
});
```

## Count queries — separate meter

`.select('*', { count: 'exact' })` runs a **second** query. Skip unless the number is rendered. Use `{ count: 'estimated' }` for large tables — cheaper and usually good enough for "X lessons" badges.

## Cache keys — stable and narrow

```ts
// Good — cache scoped to the input that changes
useQuery({ queryKey: ['lessons', courseId], ... })

// Bad — new key every render, cache never hits
useQuery({ queryKey: ['lessons', { courseId, ts: Date.now() }], ... })
```

## Anti-patterns

- `useQuery` inside a `useEffect` — double-fetch
- `refetchInterval: 5000` on anything user-visible — polling burns egress; switch to realtime channel
- No `.limit()` on a query whose table can grow past 1000 rows — Supabase caps at 1000 silently, and you still pay for those 1000
