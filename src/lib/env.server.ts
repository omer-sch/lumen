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
  /**
   * Optional. OpenAI key used by the RAG layer for embeddings
   * (`text-embedding-3-large` truncated to 1536 dim). Never appears in
   * client code. When unset, `embed()` throws on call so a misconfigured
   * deploy fails loud instead of silently producing zero-vectors.
   */
  get OPENAI_API_KEY() {
    return read("OPENAI_API_KEY", { optional: true });
  },
  get FAL_KEY() {
    return read("FAL_KEY", { optional: true });
  },
  get HF_TOKEN() {
    return read("HF_TOKEN", { optional: true });
  },
  get SENTRY_DSN() {
    return read("SENTRY_DSN", { optional: true });
  },
  /**
   * Optional. When set, base64-encoded service-account JSON used to auth
   * BigQuery. When unset, the SDK falls back to Application Default
   * Credentials (e.g. `gcloud auth application-default login` for local
   * development, or workload identity in production).
   */
  get GOOGLE_APPLICATION_CREDENTIALS_JSON() {
    return read("GOOGLE_APPLICATION_CREDENTIALS_JSON", { optional: true });
  },
  /**
   * Required. No production default — a misconfigured env must fail closed
   * rather than silently target the production project. Set explicitly in
   * `.env.local` (e.g. `BQ_PROJECT=yellowhead-visionbi-rivery`).
   */
  get BQ_PROJECT() {
    return read("BQ_PROJECT");
  },
  /**
   * Required. No default. The dataset name is part of the query path and
   * we don't want a fork or a half-configured staging env to fall back to
   * `yellowhead_prod` accidentally.
   */
  get BQ_DATASET() {
    return read("BQ_DATASET");
  },
  /**
   * Required. No default — the allowlist is the only thing keeping
   * `/api/bq/*` from leaking client data to anyone who guesses a slug, so
   * a missing env must abort cold rather than fall back to the prod
   * roster.
   */
  get ALLOWED_CLIENTS() {
    return read("ALLOWED_CLIENTS");
  },
  /**
   * Optional at import-time, required when a Supabase-backed API route
   * actually runs. The project endpoint (`https://<ref>.supabase.co`).
   * Accepts either NEXT_PUBLIC_SUPABASE_URL (Next.js convention, makes
   * the URL also available client-side) or plain SUPABASE_URL (when
   * you don't want it bundled into the client).
   */
  get SUPABASE_URL() {
    return (
      read("NEXT_PUBLIC_SUPABASE_URL", { optional: true }) ||
      read("SUPABASE_URL", { optional: true })
    );
  },
  /**
   * Optional. The publishable (anon) key. Only needed if the client
   * ever talks to Supabase directly — we don't today, but the var is
   * here so the env shape matches the dev DB setup doc. Accepts either
   * NEXT_PUBLIC_SUPABASE_ANON_KEY (legacy name) or
   * SUPABASE_PUBLISHABLE_KEY (Supabase's current naming).
   */
  get SUPABASE_ANON_KEY() {
    return (
      read("NEXT_PUBLIC_SUPABASE_ANON_KEY", { optional: true }) ||
      read("SUPABASE_PUBLISHABLE_KEY", { optional: true })
    );
  },
  /**
   * Optional at read-time. The service-role key bypasses RLS — never
   * expose to the client, never log, never commit. When unset, the
   * Supabase-backed surfaces fall back to mock data (used for the
   * LUMEN_PREVIEW design-only mode). `isSupabaseConfigured()` is the
   * branch a route should use to decide DB vs mock.
   */
  get SUPABASE_SERVICE_ROLE_KEY() {
    return read("SUPABASE_SERVICE_ROLE_KEY", { optional: true });
  },
} as const;

/**
 * True when both the project URL and the service-role key are set.
 * Server routes that have a mock fallback consult this; routes that
 * cannot meaningfully run without the DB (e.g. /api/agents/.../memory)
 * should let supabaseAdmin() throw the loud error instead. Mirrors the
 * env-name fallbacks in the getters above so the boolean stays
 * consistent with what supabaseAdmin() will actually find.
 */
export function isSupabaseConfigured(): boolean {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  return Boolean(url && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Call from a server-only entry (e.g. a startup hook) to fail fast. */
export function assertServerEnv(): void {
  // Touch each required var; throws if missing.
  void serverEnv.CLERK_SECRET_KEY;
}
