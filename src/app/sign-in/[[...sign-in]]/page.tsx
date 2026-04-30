import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";

export default function Page() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to Lumen.">
      <SignIn />
    </AuthShell>
  );
}
