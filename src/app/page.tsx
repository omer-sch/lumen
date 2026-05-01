import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  if (process.env.LUMEN_PREVIEW === "1") redirect("/dashboard");
  const { userId } = await auth();
  redirect(userId ? "/dashboard" : "/sign-in");
}
