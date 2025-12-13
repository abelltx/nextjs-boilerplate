import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export default async function PlayerPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/login");

  return (
    <main style={{ maxWidth: 720, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Player</h1>
      <p>
        Signed in as: <b>{data.user.email}</b>
      </p>

      <form action="/logout" method="post">
        <button style={{ padding: 10, marginTop: 16 }}>Sign out</button>
      </form>
    </main>
  );
}
