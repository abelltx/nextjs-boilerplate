import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";

type Row = {
  id: string;
  email: string;
  is_storyteller: boolean;
  is_admin: boolean;
};

export default async function AdminPage() {
  const { user, profile } = await getProfile();
  if (!user) redirect("/login");
  if (!profile?.is_admin) redirect("/player");

  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,is_storyteller,is_admin")
    .order("email", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];

  return (
    <main style={{ maxWidth: 980, margin: "40px auto", padding: 16, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Admin Controls</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Signed in as: <b>{user.email}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <a href="/player" style={{ alignSelf: "center" }}>Player</a>
          <a href="/storyteller" style={{ alignSelf: "center" }}>Storyteller</a>
          <form action="/logout" method="post">
            <button style={{ padding: "10px 12px", fontWeight: 800 }}>Sign out</button>
          </form>
        </div>
      </header>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Users</h2>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          Toggle <b>Storyteller</b> and <b>Admin</b>. (No stats yet — we’ll add those later.)
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Email</th>
              <th style={{ textAlign: "center", padding: 10, borderBottom: "1px solid #eee" }}>Storyteller</th>
              <th style={{ textAlign: "center", padding: 10, borderBottom: "1px solid #eee" }}>Admin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                  {r.email}
                  {r.id === user.id ? <span style={{ marginLeft: 8, opacity: 0.7 }}>(you)</span> : null}
                </td>

                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2", textAlign: "center" }}>
                  <form
                    action="/admin/update-user"
                    method="post"
                    data-json
                    onSubmit={(e) => e.preventDefault()}
                  >
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch("/admin/update-user", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ userId: r.id, set: { is_storyteller: !r.is_storyteller } }),
                        });
                        if (!res.ok) alert((await res.json()).error ?? "Update failed");
                        else location.reload();
                      }}
                      style={{ padding: "8px 10px", fontWeight: 800 }}
                    >
                      {r.is_storyteller ? "ON" : "OFF"}
                    </button>
                  </form>
                </td>

                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2", textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch("/admin/update-user", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: r.id, set: { is_admin: !r.is_admin } }),
                      });
                      if (!res.ok) alert((await res.json()).error ?? "Update failed");
                      else location.reload();
                    }}
                    style={{ padding: "8px 10px", fontWeight: 800 }}
                    disabled={r.id === user.id && r.is_admin} // guardrail: can't self-demote via UI
                    title={r.id === user.id && r.is_admin ? "Guardrail: can't remove your own admin here" : ""}
                  >
                    {r.is_admin ? "ON" : "OFF"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
