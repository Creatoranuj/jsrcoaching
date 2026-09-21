/**
 * Device-level auto "halka mode".
 *
 * Idea: agar server se baat karne me baar-baar dikkat aa rahi hai, to device
 * khud bhaari kaam (AI, search, extra panels) rok deta hai — taaki lecture,
 * PDF aur video ke liye jo thoda bandwidth bacha hai wo padhai me lage.
 *
 * Niyam: 60 second ke andar 3 failure → halka mode ON. 2 minute baad khud
 * normal. Koi server call nahi, sab kuch device par.
 */

const WINDOW_MS = 60_000; // 60 second
const FAILURE_THRESHOLD = 3; // 3 failure
const COOLDOWN_MS = 120_000; // 2 minute

let failures: number[] = [];
let degradedUntil = 0;

type Listener = (degraded: boolean) => void;
const listeners = new Set<Listener>();

function emit(): void {
  const state = isDegraded();
  listeners.forEach((l) => {
    try {
      l(state);
    } catch {
      // ek listener ka error baaki ko na rokhe
    }
  });
}

/** Abhi halka mode chal raha hai? */
export function isDegraded(): boolean {
  return Date.now() < degradedUntil;
}

/** Halka mode kab tak — UI countdown ke liye (ms, 0 = normal). */
export function degradedRemainingMs(): number {
  return Math.max(0, degradedUntil - Date.now());
}

/** Server call fail hui. */
export function reportServiceFailure(): void {
  const now = Date.now();
  failures = failures.filter((t) => now - t < WINDOW_MS);
  failures.push(now);
  if (failures.length >= FAILURE_THRESHOLD && !isDegraded()) {
    degradedUntil = now + COOLDOWN_MS;
    failures = [];
    emit();
  }
}

/** Server call theek chali — counter saaf. */
export function reportServiceSuccess(): void {
  if (failures.length === 0) return;
  failures = [];
}

/** Turant normal par wapas (admin / test ke liye). */
export function resetServiceHealth(): void {
  failures = [];
  const wasDegraded = isDegraded();
  degradedUntil = 0;
  if (wasDegraded) emit();
}

/** Halka mode badalne par batao. Cleanup function return karta hai. */
export function subscribeServiceHealth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Kisi bhi promise ko wrap karke health track karo.
 * Error wapas throw hota hai — caller ka behaviour nahi badalta.
 */
export async function trackServiceCall<T>(run: () => Promise<T>): Promise<T> {
  try {
    const out = await run();
    reportServiceSuccess();
    return out;
  } catch (err) {
    reportServiceFailure();
    throw err;
  }
}

// Cooldown khatam hone par listeners ko khud bata do (timer sirf tab chalta
// hai jab koi sun raha ho aur halka mode on ho).
if (typeof window !== "undefined") {
  window.setInterval(() => {
    if (degradedUntil !== 0 && Date.now() >= degradedUntil) {
      degradedUntil = 0;
      emit();
    }
  }, 5_000);
}
