import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/AuthShell";

export default function Page() {
  return (
    <AuthShell title="Create your account" subtitle="Welcome to Lumen.">
      <SignUp />
    </AuthShell>
  );
}
