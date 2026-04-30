import "server-only";

function read(name: string, opts: { optional?: boolean } = {}): string {
  const value = process.env[name];
  if ((!value || value.length === 0) && !opts.optional) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.local.example.`
    );
  }
  return value ?? "";
}

// Lazy getters so importing this module never throws at import time.
// Access `serverEnv.CLERK_SECRET_KEY` to validate-on-demand.
export const serverEnv = {
  get CLERK_SECRET_KEY() {
    return read("CLERK_SECRET_KEY");
  },
  get ANTHROPIC_API_KEY() {
    return read("ANTHROPIC_API_KEY", { optional: true });
  },
} as const;

/** Call from a server-only entry (e.g. a startup hook) to fail fast. */
export function assertServerEnv(): void {
  // Touch each required var; throws if missing.
  void serverEnv.CLERK_SECRET_KEY;
}
