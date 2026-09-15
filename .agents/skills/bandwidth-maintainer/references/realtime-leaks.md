# Realtime & polling leaks

A leaked `supabase.channel()` reconnects on every render and streams row diffs forever. A stray `setInterval` polling PostgREST every 5s is 17k queries/day/user. Both silently drain the egress budget.

## The one rule for channels

Every `supabase.channel(...)` MUST live in `useEffect` and return a cleanup that calls `removeChannel`.

```ts
useEffect(() => {
  const channel = supabase
    .channel(`lesson-likes-${lessonId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'lesson_likes', filter: `lesson_id=eq.${lessonId}` },
      (payload) => { /* handle */ })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [lessonId]);
```

## Find leaks

```bash
# Channels created outside useEffect (component body / module scope)
rg -n "supabase\.channel\(" src/ -B2 | rg -v "useEffect"

# useEffect with channel but no removeChannel in return
rg -n "supabase\.channel" src/ -A20 | rg -B1 "return\s*\(?\s*\)\s*=>" | rg -v "removeChannel"

# Polling burning bandwidth
rg -n "setInterval" src/ -A5 | rg -B2 "supabase\."
rg -n "refetchInterval" src/
```

## Polling audit

If a `setInterval` calls Supabase:
1. Can it be a realtime channel? Prefer that.
2. If not (e.g. heartbeat / presence), interval ≥ **5 minutes**.
3. Scope it to the page that needs it (LiveBadge pattern — only mounts on Dashboard, not app-wide).

Never poll from a root-level provider — it runs on every route.

## Publication + RLS reminder

Before relying on a realtime channel:
- Table must be in the publication: `ALTER PUBLICATION supabase_realtime ADD TABLE public.<t>;`
- RLS policies still apply to realtime — subscribers only receive rows they can SELECT.

## Anti-patterns

- `supabase.channel('x').subscribe()` at module scope or in component body → reconnects forever
- Channel name derived from `Date.now()` or `Math.random()` → new channel every render
- `setInterval(() => queryClient.invalidateQueries(...), 3000)` → hidden polling, worst offender
- Two components subscribing to the same channel with different names → duplicate row traffic
