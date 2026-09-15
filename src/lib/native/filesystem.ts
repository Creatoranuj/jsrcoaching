/**
 * Single memoized loader for `@capacitor/filesystem`.
 *
 * Mirrors the `app.ts` / `preferences.ts` pattern: one Promise per process,
 * wrapped in a container object so the resolved value's `.then` is never
 * probed on the plugin proxy.
 */
import type { Filesystem as FilesystemPlugin, Directory, Encoding } from "@capacitor/filesystem";

export type { FilesystemPlugin };

type Container = {
  plugin: typeof FilesystemPlugin;
  Directory: typeof Directory;
  Encoding: typeof Encoding;
};

let cached: Container | null = null;
let inflight: Promise<Container> | null = null;

export const loadFilesystem = async (): Promise<Container> => {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const mod = await import("@capacitor/filesystem");
    cached = {
      plugin: mod.Filesystem as typeof FilesystemPlugin,
      Directory: mod.Directory,
      Encoding: mod.Encoding,
    };
    inflight = null;
    return cached;
  })();
  return inflight;
};

/** Test-only reset — never call from production code. */
export const __resetFilesystemCache = () => {
  cached = null;
  inflight = null;
};
