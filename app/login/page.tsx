import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginClient from "./LoginClient";
import { getProfile } from "@/lib/auth/getProfile";

export default async function LoginPage() {
  const { user, profile } = await getProfile();

  if (user) {
    // New model: storytellers ALSO can be players, but we route them to storyteller by default.
    if (profile?.is_storyteller) redirect("/storyteller");
    redirect("/player");
  }

  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading...</div>}>
      <LoginClient />
    </Suspense>
  );
}
