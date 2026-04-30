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
} as const;
