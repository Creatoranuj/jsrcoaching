# Column trimming

The single highest-leverage bandwidth fix. `SELECT *` on a lessons row can be 20–50 KB (transcript_md alone often >10 KB). A list of 30 lessons = 1.5 MB per fetch, per user, per mount.

## Find candidates

```bash
rg -n "\.select\(['\"]\*" src/
rg -n "select\(['\"]\*" src/
```

Prioritise:
- Files under `src/pages/` matching `*List*`, `*Listing*`, `Dashboard*`, `MyCourse*`
- Hooks under `src/hooks/use*` that back list views
- Anything called inside a `useQuery` whose result is `.map`'d into cards

## Heavy-column blacklist (this project)

Strip from list views unless explicitly rendered:

| Table | Heavy columns |
|---|---|
| lessons | `transcript_md`, `auto_transcript`, `auto_transcript_segments`, `auto_transcript_language`, `description`, `content_html` |
| courses | `description`, `teacher_bio`, `long_description`, `syllabus_html` |
| chapters | `description`, `notes_html` |
| smart_notes / student_notes | `content`, `body_md` |
| chatbot_logs | `full_response`, `context_snippet` |
| community_posts | `body_md` |

Rule of thumb: any `text`/`jsonb` column not shown on a card = trim it.

## Minimal select templates

```ts
// Lesson card list
.select('id, title, thumbnail_url, duration_seconds, chapter_id, order_index, is_free')

// Course card list
.select('id, title, slug, thumbnail_url, price, is_published, teacher_name')

// Chapter drill-down
.select('id, title, order_index, lesson_count')
```

## Long select strings — avoid tsc explosion

Long literal `.select("...")` strings multiply type-parse cost, especially in a `let q = ...; if(...) q = q.eq(...)` builder chain. When the select is >10 columns or joins nested tables:

```ts
const sel = (s: string): string => s;

interface LessonRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
}

const { data } = await supabase
  .from('lessons')
  .select(sel('id, title, thumbnail_url, duration_seconds'))
  .eq('course_id', courseId)
  .returns<LessonRow[]>();
```

`sel()` erases the literal so supabase-js doesn't parse it at the type level. `.returns<T>()` restores consumer typing. Filter columns in `.eq()`/`.in()` remain type-checked.

## Anti-patterns

- `select('*, chapters(*), lessons(*)')` on a listing — nested `*` compounds payload
- `select('*')` + `.map(r => ({ id: r.id, title: r.title }))` — you pay bandwidth for fields you throw away
- Trimming a detail page — user opens lesson, transcript is missing. Only trim list views.
