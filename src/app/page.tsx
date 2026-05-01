import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

// Same hard gate as src/middleware.ts: LUMEN_PREVIEW is only honoured in
// non-production builds. Belt-and-braces against the env var leaking into
// a production environment.
const PREVIEW =
  process.env.NODE_ENV !== "production" &&
  process.env.LUMEN_PREVIEW === "1";

export default async function Home() {
  // Signed-in users land on /welcome which handles its own daily-greeting
  // logic (instant redirect to /dashboard on same-day reloads). Preview
  // mode goes to /dashboard so designers don't see the welcome on every
  // hot-reload during local work.
  if (PREVIEW) redirect("/dashboard");
  const { userId } = await auth();
  redirect(userId ? "/welcome" : "/sign-in");
}
