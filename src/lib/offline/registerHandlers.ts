/**
 * Offline mutation handlers — registered once at app boot.
 *
 * Wires the queue (`src/lib/offline/mutationQueue.ts`) to the actual Supabase
 * calls. When the network is back, queued writes drain through these handlers.
 *
 * Add new `kind`s here as more surfaces gain offline write support.
 */
import { supabase } from "../../integrations/supabase/client";
import { registerMutationHandler, installMutationQueueRunner } from "./mutationQueue";
import { captureException } from "../sentry";

let installed = false;

export function installOfflineMutationHandlers(): () => void {
  if (installed) return () => {};
  installed = true;

  // smart_notes upsert — same payload shape useSmartNote.save uses.
  registerMutationHandler("smart_notes.upsert", async (payload) => {
    const p = payload as {
      user_id: string;
      lesson_id: string | null;
      course_id: number | null;
      title: string;
      content_md: string;
      updated_at: string;
    };
    const onConflict = p.lesson_id ? "user_id,lesson_id" : "user_id,course_id";
    const { error } = await supabase.from("smart_notes").upsert(p, { onConflict });
    if (error) {
      captureException(error, { surface: "offline-queue:smart_notes.upsert" });
      throw error;
    }
  });

  // lesson_progress upsert (fire-and-forget watch updates).
  registerMutationHandler("lesson_progress.upsert", async (payload) => {
    const { error } = await supabase
      .from("lesson_progress")
      .upsert(payload as never, { onConflict: "user_id,lesson_id" });
    if (error) {
      captureException(error, { surface: "offline-queue:lesson_progress.upsert" });
      throw error;
    }
  });

  // lesson_bookmarks insert.
  registerMutationHandler("lesson_bookmarks.insert", async (payload) => {
    const { error } = await supabase.from("lesson_bookmarks").insert(payload as never);
    if (error) {
      captureException(error, { surface: "offline-queue:lesson_bookmarks.insert" });
      throw error;
    }
  });

  // community_reactions upsert (like/dislike on posts).
  registerMutationHandler("community_reactions.upsert", async (payload) => {
    const { error } = await supabase
      .from("community_reactions")
      .upsert(payload as never, { onConflict: "user_id,post_id" });
    if (error) {
      captureException(error, { surface: "offline-queue:community_reactions.upsert" });
      throw error;
    }
  });

  // comments insert (lesson + community comments share the shape).
  registerMutationHandler("comments.insert", async (payload) => {
    const { error } = await supabase.from("comments").insert(payload as never);
    if (error) {
      captureException(error, { surface: "offline-queue:comments.insert" });
      throw error;
    }
  });

  // doubt_sessions insert (student-submitted doubts).
  registerMutationHandler("doubt_sessions.insert", async (payload) => {
    const { error } = await supabase.from("doubt_sessions").insert(payload as never);
    if (error) {
      captureException(error, { surface: "offline-queue:doubt_sessions.insert" });
      throw error;
    }
  });

  return installMutationQueueRunner();
}

