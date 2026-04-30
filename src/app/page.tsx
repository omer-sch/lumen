import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  if (process.env.LUMEN_PREVIEW === "1") redirect("/welcome");
  const { userId } = await auth();
  redirect(userId ? "/welcome" : "/sign-in");
}
