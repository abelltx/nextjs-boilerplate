"use client";

type Row = {
  id: string;
  email: string;
  is_storyteller: boolean;
  is_admin: boolean;
};

function accessLabel(r: Row) {
  return `${r.is_admin ? "admin " : ""}${r.is_storyteller ? "storyteller " : ""}player`.trim();
}

export default function AdminClient({
  meId,
  meEmail,
  rows,
}: {
  meId: string;
  meEmail: string;
  rows: Row[];
}) {
  async function toggle(userId: string, field: "is_storyteller" | "is_admin", current: boolean) {
    const res = await fetch("/admin/update-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, set: { [field]: !current } }),
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(payload.error ?? "Update failed");
      return;
    }

    location.reload();
  }

  return (
    <main style={{ maxWidth: 980, margin: "40px auto", padding: 16, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Admin Controls</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Signed in as: <b>{meEmail}</b>
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
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Access</th>
              <th style={{ textAlign: "center", padding: 10, borderBottom: "1px solid #eee" }}>Storyteller</th>
              <th style={{ textAlign: "center", padding: 10, borderBottom: "1px solid #eee" }}>Admin</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                  {r.email}
                  {r.id === meId ? <span style={{ marginLeft: 8, opacity: 0.7 }}>(you)</span> : null}
                </td>

                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                  {accessLabel(r)}
                </td>

                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2", textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => toggle(r.id, "is_storyteller", r.is_storyteller)}
                    style={{ padding: "8px 10px", fontWeight: 800 }}
                  >
                    {r.is_storyteller ? "ON" : "OFF"}
                  </button>
                </td>

                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2", textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => toggle(r.id, "is_admin", r.is_admin)}
                    style={{ padding: "8px 10px", fontWeight: 800 }}
                    disabled={r.id === meId && r.is_admin}
                    title={r.id === meId && r.is_admin ? "Guardrail: can't remove your own admin here" : ""}
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
