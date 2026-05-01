// Next.js calls register() once when the server boots.
// Used for Sentry initialization and env var validation.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { assertServerEnv } = await import("./lib/env.server");
    assertServerEnv();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => {
  const { captureRequestError } = await import("@sentry/nextjs");
  // @ts-expect-error — spread args match Sentry's onRequestError signature
  captureRequestError(...args);
};
