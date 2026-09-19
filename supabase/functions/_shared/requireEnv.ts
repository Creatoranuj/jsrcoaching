/**
 * Environment access with a clear, actionable failure.
 *
 * `Deno.env.get("X")!` turns a missing secret into a confusing downstream
 * crash ("Invalid API key", "fetch failed"). These helpers fail loudly and
 * name the exact secret that must be configured.
 */

export class MissingEnvError extends Error {
  readonly names: string[];
  constructor(names: string[]) {
    super(`Missing required environment variable(s): ${names.join(", ")}`);
    this.name = "MissingEnvError";
    this.names = names;
  }
}

/** Returns the value of `name`, or throws a MissingEnvError naming it. */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new MissingEnvError([name]);
  return value;
}

/** Returns all requested values, reporting every missing name at once. */
export function requireEnvAll<T extends readonly string[]>(
  ...names: T
): Record<T[number], string> {
  const out = {} as Record<string, string>;
  const missing: string[] = [];
  for (const name of names) {
    const value = Deno.env.get(name);
    if (!value) missing.push(name);
    else out[name] = value;
  }
  if (missing.length) throw new MissingEnvError(missing);
  return out as Record<T[number], string>;
}

/**
 * A 500 response that names the missing secret without leaking its value.
 * Use in a catch block so a misconfigured deploy is obvious in the logs.
 */
export function missingEnvResponse(
  error: unknown,
  headers: HeadersInit = {},
): Response | null {
  if (!(error instanceof MissingEnvError)) return null;
  console.error(`[config] ${error.message}`);
  return new Response(
    JSON.stringify({
      error: "Server configuration incomplete",
      code: "missing_env",
      missing: error.names,
    }),
    { status: 500, headers: { ...headers, "Content-Type": "application/json" } },
  );
}
