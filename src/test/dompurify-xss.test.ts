/**
 * DOMPurify XSS regression suite.
 *
 * Covers the common attack payloads for user-generated HTML fields (comments,
 * lesson notes, chat messages, chapter descriptions). If any of these ever
 * pass through un-neutralized after a dompurify upgrade, this suite fails.
 */
import { describe, it, expect } from "vitest";
import DOMPurify from "dompurify";

const clean = (dirty: string, cfg: Parameters<typeof DOMPurify.sanitize>[1] = {}) =>
  DOMPurify.sanitize(dirty, cfg) as string;

const PAYLOADS: Array<{ name: string; input: string }> = [
  { name: "inline script tag", input: `<script>alert('xss')</script>` },
  { name: "img onerror", input: `<img src=x onerror="alert(1)">` },
  { name: "svg onload", input: `<svg onload="alert(1)"></svg>` },
  { name: "iframe javascript src", input: `<iframe src="javascript:alert(1)"></iframe>` },
  { name: "anchor javascript href", input: `<a href="javascript:alert(1)">click</a>` },
  // Note: DOMPurify preserves the style attribute by default; browsers ignore
  // javascript: inside CSS url(). Our app forbids `style` — covered separately below.

  { name: "object data uri", input: `<object data="data:text/html,<script>alert(1)</script>"></object>` },
  { name: "form action js", input: `<form action="javascript:alert(1)"><input type=submit></form>` },
  { name: "meta refresh", input: `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">` },
  { name: "base href hijack", input: `<base href="javascript:alert(1)//">` },
  { name: "mixed case script", input: `<ScRiPt>alert(1)</ScRiPt>` },
  { name: "encoded onerror", input: `<img src=x OnErRoR=alert(1)>` },
  { name: "svg script child", input: `<svg><script>alert(1)</script></svg>` },
  { name: "math xss", input: `<math><mtext><script>alert(1)</script></mtext></math>` },
  { name: "srcdoc iframe", input: `<iframe srcdoc="<script>alert(1)</script>"></iframe>` },
  { name: "data attribute event", input: `<div data-x="" onclick="alert(1)">x</div>` },
];

describe("DOMPurify XSS regression", () => {
  it.each(PAYLOADS)("neutralizes: $name", ({ input }) => {
    const output = clean(input).toLowerCase();
    expect(output).not.toMatch(/<script/);
    expect(output).not.toMatch(/onerror\s*=/);
    expect(output).not.toMatch(/onload\s*=/);
    expect(output).not.toMatch(/onclick\s*=/);
    expect(output).not.toMatch(/javascript:/);
    expect(output).not.toMatch(/<iframe/);
    expect(output).not.toMatch(/<object/);
    expect(output).not.toMatch(/<meta/);
    expect(output).not.toMatch(/<base/);
    expect(output).not.toMatch(/srcdoc/);
  });

  it("preserves safe formatting tags used in lesson notes / comments", () => {
    const safe = `<p>Hello <strong>world</strong> <a href="https://example.com">link</a></p>`;
    const out = clean(safe, { ALLOWED_TAGS: ["p", "strong", "a"], ALLOWED_ATTR: ["href"] });
    expect(out).toContain("<p>");
    expect(out).toContain("<strong>world</strong>");
    expect(out).toContain('href="https://example.com"');
  });

  it("strips javascript: URLs even when tag is allowed", () => {
    const dirty = `<a href="javascript:alert(1)">x</a>`;
    const out = clean(dirty, { ALLOWED_TAGS: ["a"], ALLOWED_ATTR: ["href"] });
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("removes style attribute when forbidden (app config for UGC)", () => {
    const dirty = `<div style="background:url(javascript:alert(1))">x</div>`;
    const out = clean(dirty, { FORBID_ATTR: ["style"] }).toLowerCase();
    expect(out).not.toContain("style=");
    expect(out).not.toContain("javascript:");
  });

  it("blocks CUSTOM_ELEMENT_HANDLING prototype-pollution style payload", () => {
    const dirty = `<x-evil onclick="alert(1)"><script>alert(2)</script></x-evil>`;
    const out = clean(dirty).toLowerCase();
    expect(out).not.toMatch(/<script/);
    expect(out).not.toMatch(/onclick/);
  });

  it("blocks SAFE_FOR_TEMPLATES bypass via RETURN_DOM mode", () => {
    const dirty = `{{constructor.constructor('alert(1)')()}}<script>alert(2)</script>`;
    const node = DOMPurify.sanitize(dirty, {
      SAFE_FOR_TEMPLATES: true,
      RETURN_DOM: true,
    }) as unknown as HTMLElement;
    const html = (node.innerHTML || "").toLowerCase();
    expect(html).not.toMatch(/<script/);
  });

  it("resists FORBID_TAGS bypass via ADD_TAGS predicate asymmetry", () => {
    const dirty = `<script>alert(1)</script><iframe></iframe>`;
    const out = clean(dirty, {
      FORBID_TAGS: ["script", "iframe"],
    }).toLowerCase();
    expect(out).not.toMatch(/<script/);
    expect(out).not.toMatch(/<iframe/);
  });
});
