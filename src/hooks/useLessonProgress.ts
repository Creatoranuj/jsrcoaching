import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { enqueueMutation } from "@/lib/offline/mutationQueue";
import {
  coveredSeconds,
  mergeInterval,
  normaliseIntervals,
  type Interval,
} from "@/lib/watchedIntervals";


export interface LessonProgressRow {
  watched_seconds: number;
  last_position_seconds: number;
  completed: boolean;
  watched_intervals?: unknown;
}

/**
 * Reads existing progress for (user, lesson) on mount, and exposes a
 * debounced `report(currentSeconds)` and `flush()` that upserts to Supabase.
 *
 *   • Writes at most once every 5s while the user is actively reporting.
 *   • Call `flush()` on pause / unmount / app-background for immediate write.
 *   • Marks `completed = true` when ACCUMULATED unique watched seconds
 *     reach ≥ 90 % of duration (jumping to the end does NOT count).
 */
export function useLessonProgress(
  lessonId: string | undefined,
  durationSeconds: number,
  onResumeAvailable?: (lastPosition: number) => void
) {
  const { user } = useAuth();
  const watchedRef = useRef(0);
  const lastPosRef = useRef(0);
  const prevTickRef = useRef<number | null>(null);
  const intervalsRef = useRef<Interval[]>([]);
  const pendingRef = useRef(false);
  const lastWriteAtRef = useRef(0);
  const completedRef = useRef(false);
  const onResumeRef = useRef(onResumeAvailable);
  onResumeRef.current = onResumeAvailable;
  // Snapshot duration in a ref so writeNow's identity stays stable across
  // ~250ms YouTube infoDelivery ticks (otherwise the 5s debounce resets and
  // we get up to 4 upserts/second to Supabase).
  const durationRef = useRef(durationSeconds);
  durationRef.current = durationSeconds;

  // Initial fetch — resume point + restore watched intervals.
  useEffect(() => {
    if (!user?.id || !lessonId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("lesson_progress" as never)
        .select("watched_seconds,last_position_seconds,completed,watched_intervals")
        .eq("user_id", user.id)
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as unknown as LessonProgressRow;
      watchedRef.current = row.watched_seconds ?? 0;
      lastPosRef.current = row.last_position_seconds ?? 0;
      completedRef.current = !!row.completed;
      intervalsRef.current = normaliseIntervals(row.watched_intervals);
      if (row.last_position_seconds > 5 && onResumeRef.current) {
        onResumeRef.current(row.last_position_seconds);
      }
    })();
    return () => {
      cancelled = true;
      prevTickRef.current = null;
    };
  }, [user?.id, lessonId]);

  const writeNow = useCallback(async () => {
    if (!user?.id || !lessonId) return;
    pendingRef.current = false;
    lastWriteAtRef.current = Date.now();
    const covered = coveredSeconds(intervalsRef.current);
    const dur = durationRef.current;
    const completed =
      dur > 0 && covered >= 0.9 * dur;
    completedRef.current = completed || completedRef.current;
    const payload = {
      user_id: user.id,
      lesson_id: lessonId,
      watched_seconds: Math.floor(Math.max(watchedRef.current, covered)),
      last_position_seconds: Math.floor(lastPosRef.current),
      completed: completedRef.current,
      watched_intervals: intervalsRef.current,
      updated_at: new Date().toISOString(),
    };
    // Offline-first: skip the online attempt and queue immediately so the
    // mutation queue's idempotency dedupe handles bursts during patchy networks.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      enqueueMutation("lesson_progress.upsert", payload);
      return;
    }
    try {
      await supabase
        .from("lesson_progress" as never)
        .upsert(payload as never, { onConflict: "user_id,lesson_id" } as never);
    } catch (err) {
      console.debug("[lesson_progress] upsert failed → queued", err);
      enqueueMutation("lesson_progress.upsert", payload);
    }
  }, [user?.id, lessonId]);


  const report = useCallback(
    (currentSeconds: number) => {
      if (!user?.id || !lessonId) return;
      const prev = prevTickRef.current;
      // Only count as "actually watched" when this tick is a small natural
      // forward step (≤ 2s) — anything bigger is a seek/jump.
      if (prev !== null && currentSeconds > prev && currentSeconds - prev <= 2) {
        intervalsRef.current = mergeInterval(intervalsRef.current, [prev, currentSeconds]);
      }
      prevTickRef.current = currentSeconds;
      lastPosRef.current = currentSeconds;
      if (currentSeconds > watchedRef.current) {
        watchedRef.current = currentSeconds;
      }
      const now = Date.now();
      if (now - lastWriteAtRef.current >= 5000) {
        void writeNow();
      } else {
        pendingRef.current = true;
      }
    },
    [user?.id, lessonId, writeNow]
  );

  const flush = useCallback(() => {
    if (pendingRef.current || Date.now() - lastWriteAtRef.current >= 1000) {
      void writeNow();
    }
  }, [writeNow]);

  // Flush on unmount.
  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return { report, flush };
}
