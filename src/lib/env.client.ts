// Validates NEXT_PUBLIC_* envs that the client needs.
// Safe to import from both server and client components.
function readPublic(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.local.example.`
    );
  }
  return value;
}

export const publicEnv = {
  CLERK_PUBLISHABLE_KEY: readPublic("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  // PostHog key is optional — if missing, analytics are silently skipped.
  // Sentry DSN is validated via NEXT_PUBLIC_SENTRY_DSN (also optional in dev).
} as const;
