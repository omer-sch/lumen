import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

// Same hard gate as src/middleware.ts: LUMEN_PREVIEW is only honoured in
// non-production builds. Belt-and-braces against the env var leaking into
// a production environment.
const PREVIEW =
  process.env.NODE_ENV !== "production" &&
  process.env.LUMEN_PREVIEW === "1";

export default async function Home() {
  if (PREVIEW) redirect("/dashboard");
  const { userId } = await auth();
  redirect(userId ? "/dashboard" : "/sign-in");
}
