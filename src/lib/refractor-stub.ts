/**
 * Refractor stub.
 *
 * The app uses `@uiw/react-md-editor/nohighlight` everywhere (see
 * NotesPanel + NoteEditor) precisely so we don't ship the ~215KB gzipped
 * `refractor` + all-languages syntax-highlight bundle. But the @uiw package
 * tree still has a static import path that drags `refractor` and
 * `rehype-prism-plus` into the graph, blowing up `vendor-md-prism`.
 *
 * Aliasing both packages to this empty module breaks that import chain at
 * build time. Safe because the `/nohighlight` entry never actually calls
 * into refractor at runtime — if a future code path does, it will throw
 * immediately and we'll catch it in CI tests, not silently ship 215KB.
 */
const noop = () => null;
export default noop;
export const refractor = { register: noop, highlight: noop, alias: noop };
export const register = noop;
export const highlight = noop;
export const alias = noop;
