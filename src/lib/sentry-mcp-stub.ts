// Empty stub for @sentry/core's Node-only `mcp-server` integration.
//
// Why: Sentry v10 ships an MCP (Model-Context-Protocol) server integration
// inside @sentry/core/build/esm/integrations/mcp-server/. It's only useful in
// Node server processes — the browser bundle never calls it. However rolldown
// (vite 8) on some platforms (notably Replit's clean `npm ci`) fails to
// resolve `./errorCapture.js` inside that subtree, breaking the entire build:
//
//   No such file or directory  ./errorCapture.js
//
// By aliasing every module under that path to this empty stub, rolldown never
// walks into the broken/optional subtree. The browser build shrinks slightly
// and becomes reproducible across platforms.
export {};
export default {};
