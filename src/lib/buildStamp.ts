// Reads the CI-written /nb-build.json stamp that ships inside dist/ (and
// therefore inside the APK's assets/public). Lets a user tell from the screen
// WHICH build they are running, so "purana build to nahi hai?" stops being a
// guessing game during payment triage.
export type BuildStamp = {
  sha: string;
  run: string;
  version: string;
  builtAt: string;
};

let cached: BuildStamp | null | undefined;

export async function loadBuildStamp(): Promise<BuildStamp | null> {
  if (cached !== undefined) return cached;
  try {
    const res = await fetch("/nb-build.json", { cache: "no-store" });
    if (!res.ok) {
      cached = null;
      return cached;
    }
    const json = (await res.json()) as Partial<BuildStamp>;
    cached =
      json && typeof json.sha === "string"
        ? {
            sha: json.sha,
            run: String(json.run ?? ""),
            version: String(json.version ?? ""),
            builtAt: String(json.builtAt ?? ""),
          }
        : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function formatBuildStamp(stamp: BuildStamp | null): string | null {
  if (!stamp) return null;
  const short = stamp.sha.slice(0, 7);
  return stamp.version ? `${stamp.version} (${short})` : short;
}
