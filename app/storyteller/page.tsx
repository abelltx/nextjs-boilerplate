import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";

export default async function StorytellerPage() {
  const { user, profile } = await getProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "storyteller") redirect("/player");

  return (
    <main style={{ maxWidth: 720, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Storyteller Dashboard</h1>

      <p>Signed in as: <b>{user.email}</b></p>
      <p>Role: <b>{profile.role}</b></p>

      <form action="/logout" method="post">
        <button style={{ padding: 10, marginTop: 16 }}>Sign out</button>
      </form>
    </main>
  );
}
