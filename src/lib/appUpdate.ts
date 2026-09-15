// JSR COACHING — "Update available, tap to reload" prompt.
//
// Why this exists (Sentry triage):
//   * "TypeError: Failed to fetch dynamically imported module: /assets/Profile-*.js"
//     — a tab opened before a deploy asks for a lazy chunk whose hashed
//       filename no longer exists on the CDN. The route silently dies.
//   * public/sw.js calls skipWaiting() + clients.claim(), so a new service
//     worker takes control of an already-open page whose JS is from the old
//     build — same stale-chunk trap.
//
// Both cases are unrecoverable without a reload, so we surface ONE persistent
// toast with a Reload action instead of throwing an error at the student.

export type UpdateNotifier = (opts: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) => void;

const TITLE = "Update available — tap to reload";
const ACTION_LABEL = "Reload";

let prompted = false;

/** Test-only: clears the one-shot guard between cases. */
export function resetAppUpdatePrompt(): void {
  prompted = false;
}

/**
 * A `controllerchange` with no previous controller is just the FIRST service
 * worker taking control on a fresh visit — not a new app version. Only prompt
 * when a controller was already driving the page.
 */
export function shouldPromptOnControllerChange(hadController: boolean): boolean {
  return hadController;
}

/**
 * Shows the update prompt at most once per page load. Returns true when the
 * notifier was actually invoked.
 */
export function promptAppUpdate(notify: UpdateNotifier, reload: () => void): boolean {
  if (prompted) return false;
  prompted = true;
  notify({ title: TITLE, actionLabel: ACTION_LABEL, onAction: reload });
  return true;
}

function defaultReload(): void {
  window.location.reload();
}

async function defaultNotify(opts: Parameters<UpdateNotifier>[0]): Promise<void> {
  try {
    const { toast } = await import("sonner");
    toast(opts.title, {
      id: "app-update",
      duration: Infinity,
      action: { label: opts.actionLabel, onClick: opts.onAction },
    });
  } catch {
    // Toast layer unavailable (very early boot) — reload rather than leave the
    // student staring at a route that can never finish loading.
    opts.onAction();
  }
}

/** Wires the update prompt to Vite preload failures and service-worker takeovers. */
export function initAppUpdatePrompt(): void {
  if (typeof window === "undefined") return;

  const notify: UpdateNotifier = (opts) => {
    void defaultNotify(opts);
  };

  // Vite fires this when a lazy chunk 404s after a deploy.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    promptAppUpdate(notify, defaultReload);
  });

  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!shouldPromptOnControllerChange(hadController)) return;
    promptAppUpdate(notify, defaultReload);
  });
}
