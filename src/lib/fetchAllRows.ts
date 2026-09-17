/**
 * Page through a Supabase select() past PostgREST's 1000-row default cap.
 *
 * AUDIT 2026-09-17: admin analytics read `quiz_attempts` / `user_progress`
 * with a bare `select()`, so every number silently froze at 1000 rows once the
 * platform grew. Pass a builder factory and this walks `.range()` until a
 * short page comes back.
 *
 * Usage:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from("user_progress").select("user_id, completed").range(from, to)
 *   );
 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // hard stop at 50k rows so a bad filter can't hang the UI

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
