// JSR COACHING — "is a newer APK out?" without depending on the backend.
//
// The update prompt normally reads `app_config.latest_android_version`, which
// CI publishes after every release. When that publish step cannot run (the
// release-publish function is not deployed / returns 404), the column goes
// stale and students never see the update prompt at all.
//
// GitHub's public "latest release" endpoint is the same fact from the source of
// truth, needs no key, and can never point anywhere but our own repo. We use it
// ONLY as a soft nudge: a hard/forced update still comes from the database.

export const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/Creatoranuj/jsrcoaching/releases/latest";

const VERSION_RE = /^\d+(\.\d+){0,3}$/;

/** `v1.8.9` / `1.8.9` → `1.8.9`; anything unexpected → null. */
export function parseReleaseVersion(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  const cleaned = tag.trim().replace(/^v/i, "");
  return VERSION_RE.test(cleaned) ? cleaned : null;
}

/**
 * Newest published release version, or null when the request fails, is rate
 * limited, or the tag is not a plain version (e.g. a dated dispatch tag).
 * Never throws — a failed check must simply mean "no nudge".
 */
export async function fetchLatestReleaseVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(GITHUB_LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: unknown; name?: unknown };
    return parseReleaseVersion(body?.tag_name) ?? parseReleaseVersion(body?.name);
  } catch {
    return null;
  }
}
