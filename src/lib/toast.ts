/**
 * Human-tone toast helpers. Prefer these over raw `toast.*` in hooks/components.
 *
 * Rules (see mem://human-tone-ui):
 * - Success: past tense, ≤5 words, NO trailing `!`, NO emoji.
 * - Error:   `[what broke] — [what to do]`. Real error code goes to logError.
 * - Info:    verb+object, present tense.
 *
 * Legacy `toast.success("Note saved!")` still works during migration —
 * these helpers just make the good pattern effortless.
 */
import { toast } from "sonner";
import { logError } from "@/lib/log";

export const notify = {
  saved:   (entity = "Saved")   => toast.success(entity.endsWith("saved") ? entity : `${entity} saved`),
  updated: (entity = "Updated") => toast.success(entity.endsWith("updated") ? entity : `${entity} updated`),
  deleted: (entity = "Deleted") => toast.success(entity.endsWith("deleted") ? entity : `${entity} deleted`),
  posted:  (entity = "Posted")  => toast.success(entity.endsWith("posted") ? entity : `${entity} posted`),
  copied:  ()                   => toast.success("Copied"),
  done:    (msg: string)        => toast.success(msg),

  /** Info toast — verb+object, present tense, no `!`. */
  info:    (msg: string)        => toast.info(msg),

  /**
   * Human error: shows `[human message]`, logs the raw error to Sentry.
   * Example: notify.failed("Note save nahi hui — dobara try karo", err, "useStudentNotes.save")
   */
  failed:  (msg: string, err?: unknown, surface?: string) => {
    if (err !== undefined) logError(err, surface ? { surface } : undefined);
    toast.error(msg);
  },
};
