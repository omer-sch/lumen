// Next.js calls register() once when the server boots.
// Use it to fail fast on missing env vars before any request is handled.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertServerEnv } = await import("./lib/env.server");
    assertServerEnv();
  }
}
