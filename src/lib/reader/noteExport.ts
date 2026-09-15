/**
 * Export a reader note (markdown) out of the app, using the Obsidian
 * conventions from kepano's Obsidian skills: YAML "Properties" frontmatter,
 * ATX headings, `-` list markers, `- [ ]` tasks and callouts.
 *
 *  - `shareNoteMarkdown` — writes a real `.md` file and opens the native share
 *    sheet (Save to Files / Drive / any Obsidian vault folder). On web it
 *    triggers a normal browser download.
 *  - `openInObsidian` — hands the note to the Obsidian app via the
 *    `obsidian://new` URI. Falls back to the `.md` share when the note is too
 *    long for a URI, the plugin bridge is unavailable, or the app is missing.
 *
 * Notes stay on-device: nothing here touches the network or Supabase.
 */

const VAULT_KEY = "nb_obsidian_vault";
const FOLDER_KEY = "nb_obsidian_folder";

/** Obsidian/Android choke on very long custom-scheme URIs. */
export const OBSIDIAN_URI_LIMIT = 8000;

export function getVault(): string | null {
  try {
    const v = localStorage.getItem(VAULT_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setVault(name: string): void {
  try {
    localStorage.setItem(VAULT_KEY, name.trim());
  } catch {
    /* private mode — deep link still works this session */
  }
}

export function getVaultFolder(): string | null {
  try {
    const v = localStorage.getItem(FOLDER_KEY);
    const clean = v ? v.replace(/^\/+|\/+$/g, "").trim() : "";
    return clean || null;
  } catch {
    return null;
  }
}

export function setVaultFolder(folder: string): void {
  try {
    const clean = folder.replace(/^\/+|\/+$/g, "").trim();
    if (clean) localStorage.setItem(FOLDER_KEY, clean);
    else localStorage.removeItem(FOLDER_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Light markdown normaliser following kepano's formatting rules:
 * `-` bullets, a space after ATX hashes, no trailing whitespace, at most one
 * blank line in a row. Deliberately conservative — it never rewrites prose.
 */
export function normalizeMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = lines.map((line) => {
    let l = line.replace(/[ \t]+$/, "");
    l = l.replace(/^(\s*)[*+](\s+)/, "$1-$2"); // * / + bullets -> -
    l = l.replace(/^(\s*)(#{1,6})([^#\s])/, "$1$2 $3"); // ##Heading -> ## Heading
    l = l.replace(/^(\s*-\s)\[\s?\]\s?/, "$1[ ] "); // tasks -> "- [ ] "
    return l;
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";
}

/** Parse an existing YAML frontmatter block into raw key -> line map. */
function splitFrontmatter(md: string): { keys: Set<string>; head: string[]; body: string } | null {
  if (!/^---\r?\n/.test(md)) return null;
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const end = lines.indexOf("---", 1);
  if (end === -1) return null;
  const head = lines.slice(1, end);
  const keys = new Set(
    head.map((l) => /^([A-Za-z0-9_-]+):/.exec(l)?.[1]).filter((k): k is string => Boolean(k)),
  );
  return { keys, head, body: lines.slice(end + 1).join("\n").replace(/^\n/, "") };
}

export interface NoteMeta {
  title?: string;
  page?: number;
  tags?: string[];
  aliases?: string[];
}

/**
 * Obsidian "Properties" block. When the note already carries frontmatter we
 * only *merge in* the keys it is missing — the user's own values always win.
 */
export function withFrontmatter(md: string, meta: NoteMeta = {}): string {
  const title = (meta.title || "note").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/"/g, "'");
  const today = new Date().toISOString().slice(0, 10);
  const tags = meta.tags?.length ? meta.tags : ["jsr-coaching", "pdf-note"];

  const props: [string, string[]][] = [
    ["title", [`title: "${title}"`]],
    ["source", ["source: JSR COACHING"]],
    ["created", [`created: ${today}`]],
    ["updated", [`updated: ${today}`]],
  ];
  if (typeof meta.page === "number" && meta.page > 0) props.push(["page", [`page: ${meta.page}`]]);
  if (meta.aliases?.length) props.push(["aliases", ["aliases:", ...meta.aliases.map((a) => `  - ${a}`)]]);
  props.push(["tags", ["tags:", ...tags.map((t) => `  - ${t}`)]]);

  const existing = splitFrontmatter(md);
  if (!existing) {
    const head = props.flatMap(([, lines]) => lines);
    return `---\n${head.join("\n")}\n---\n\n${md.replace(/^\n+/, "")}`;
  }

  const missing = props.filter(([key]) => !existing.keys.has(key)).flatMap(([, lines]) => lines);
  const head = [...existing.head, ...missing];
  return `---\n${head.join("\n")}\n---\n\n${existing.body.replace(/^\n+/, "")}`;
}

/** Safe, readable markdown filename derived from the document title. */
export function noteFilename(title?: string): string {
  const base = (title || "note")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "note"}.md`;
}

/** `vault/folder/Name` (no extension) — what Obsidian calls the file path. */
export function vaultFilePath(title?: string, folder?: string | null): string {
  const base = noteFilename(title).replace(/\.md$/, "");
  const clean = folder ? folder.replace(/^\/+|\/+$/g, "").trim() : "";
  return clean ? `${clean}/${base}` : base;
}

/** `obsidian://new?vault=…&file=…&content=…` with everything encoded. */
export function buildObsidianUri(vault: string, title: string, md: string, folder?: string | null): string {
  return (
    `obsidian://new?vault=${encodeURIComponent(vault)}` +
    `&file=${encodeURIComponent(vaultFilePath(title, folder))}` +
    `&content=${encodeURIComponent(md)}`
  );
}

/** `obsidian://open?vault=…&file=…` — jump to the note already in the vault. */
export function buildObsidianOpenUri(vault: string, title: string, folder?: string | null): string {
  return (
    `obsidian://open?vault=${encodeURIComponent(vault)}` +
    `&file=${encodeURIComponent(vaultFilePath(title, folder))}`
  );
}

async function nativeFS() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  return { Filesystem, Directory, Encoding };
}

/**
 * Share the note as a `.md` file. Returns false when the user cancels.
 * Falls back to a browser download when the native plugins are missing
 * (`… plugin is not implemented` on a stale APK) instead of throwing.
 */
export async function shareNoteMarkdown(title: string, md: string): Promise<boolean> {
  const filename = noteFilename(title);

  const webDownload = () => {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 0);
    return true;
  };

  let fs: Awaited<ReturnType<typeof nativeFS>> = null;
  try {
    fs = await nativeFS();
  } catch {
    return webDownload();
  }
  if (!fs) return webDownload();

  try {
    const path = `exports/${filename}`;
    await fs.Filesystem.writeFile({
      path,
      data: md,
      directory: fs.Directory.Cache,
      encoding: fs.Encoding.UTF8,
      recursive: true,
    });
    const { uri } = await fs.Filesystem.getUri({ path, directory: fs.Directory.Cache });

    const { Share } = await import("@capacitor/share");
    await Share.share({ title: filename, url: uri, dialogTitle: "Save note (.md)" });
    return true;
  } catch (err) {
    const msg = (err as Error)?.message || String(err);
    if (/cancel/i.test(msg)) return false;
    // "… plugin is not implemented on android" / plugin not loaded: don't lose
    // the user's note — hand it to the WebView download path instead.
    if (/not implemented|not available|unimplemented|plugin/i.test(msg)) return webDownload();
    throw err;
  }
}

export type ObsidianResult = "opened" | "needs-vault" | "fell-back";

/**
 * Launch a custom-scheme URI and report *honestly* whether something handled
 * it. `window.location.href = uri` never throws when no app is registered, so
 * the old version reported "opened" even when nothing happened and the note
 * silently went nowhere. We watch for the page losing focus/visibility — that
 * only happens when another app actually took over — and treat a quiet
 * timeout as "not handled" so the caller can fall back to the `.md` share.
 */
async function launchUri(uri: string): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      try {
        const { App } = await import("@capacitor/app");
        const res = (await App.openUrl({ url: uri })) as { completed?: boolean } | undefined;
        return res?.completed !== false;
      } catch {
        // App plugin missing / no activity found — fall through to the WebView
        // navigation, which Android still resolves to an intent when present.
      }
    }
  } catch {
    /* @capacitor/core unavailable (pure web) */
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") finish(true);
    };
    const onBlur = () => finish(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);
    const timer = window.setTimeout(() => finish(false), 1400);
    try {
      window.location.href = uri;
    } catch {
      finish(false);
    }
  });
}


/**
 * Try the Obsidian deep link; fall back to the `.md` share when the note is
 * oversized, the plugin bridge is unavailable, or the app is not installed.
 */
export async function openInObsidian(title: string, md: string): Promise<ObsidianResult> {
  const vault = getVault();
  if (!vault) return "needs-vault";

  const uri = buildObsidianUri(vault, title, md, getVaultFolder());
  if (uri.length > OBSIDIAN_URI_LIMIT) {
    await shareNoteMarkdown(title, md);
    return "fell-back";
  }

  const ok = await launchUri(uri);
  if (ok) return "opened";

  await shareNoteMarkdown(title, md);
  return "fell-back";
}

/** Open an existing note in the vault (no content payload). */
export async function revealInObsidian(title: string): Promise<boolean> {
  const vault = getVault();
  if (!vault) return false;
  return launchUri(buildObsidianOpenUri(vault, title, getVaultFolder()));
}
