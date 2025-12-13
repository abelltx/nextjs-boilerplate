import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";

export default async function PlayerPage() {
  // 1) Require login + get role
  const { user, profile } = await getProfile();
  if (!user) redirect("/login");

  const supabase = await supabaseServer();

  // 2) Get (or create) the player's character (MVP: first character only)
  const { data: existingCharacters, error: charReadErr } = await supabase
    .from("characters")
    .select("id,user_id,name,class,level,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (charReadErr) {
    throw new Error(`Failed to load character: ${charReadErr.message}`);
  }

  let character = existingCharacters?.[0] ?? null;

  if (!character) {
    const { data: created, error: charCreateErr } = await supabase
      .from("characters")
      .insert({
        user_id: user.id,
        name: "Neweyes Adventurer",
        class: "Pilgrim",
        level: 1,
      })
      .select("id,user_id,name,class,level,created_at")
      .single();

    if (charCreateErr) {
      throw new Error(`Failed to create character: ${charCreateErr.message}`);
    }

    character = created;
  }

  // 3) Get (or create) story_state
  const { data: storyRow, error: storyReadErr } = await supabase
    .from("story_state")
    .select("user_id, story_text, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (storyReadErr) {
    throw new Error(`Failed to load story: ${storyReadErr.message}`);
  }

  let storyText = storyRow?.story_text ?? "";

  if (!storyRow) {
    const { error: storyCreateErr } = await supabase.from("story_state").insert({
      user_id: user.id,
      story_text:
        "Welcome to Neweyes Online.\n\nYour story will appear here. (MVP: read-only for now.)",
    });

    if (storyCreateErr) {
      throw new Error(`Failed to create story: ${storyCreateErr.message}`);
    }

    storyText =
      "Welcome to Neweyes Online.\n\nYour story will appear here. (MVP: read-only for now.)";
  }

  // 4) Load inventory for that character
  const { data: inventory, error: invErr } = await supabase
    .from("inventory_items")
    .select("id,name,quantity,created_at")
    .eq("character_id", character.id)
    .order("created_at", { ascending: true });

  if (invErr) {
    throw new Error(`Failed to load inventory: ${invErr.message}`);
  }

  return (
    <main style={{ maxWidth: 920, margin: "40px auto", padding: 16, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Player Dashboard</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            <span>Signed in as: <b>{user.email}</b></span>
            <span style={{ marginLeft: 12 }}>Role: <b>{profile?.role ?? "unknown"}</b></span>
          </div>
        </div>

        <form action="/logout" method="post">
          <button style={{ padding: "10px 12px", fontWeight: 800 }}>Sign out</button>
        </form>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Character card */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Character</h2>
          <div style={{ display: "grid", gap: 8 }}>
            <div><b>Name:</b> {character.name}</div>
            <div><b>Class:</b> {character.class}</div>
            <div><b>Level:</b> {character.level}</div>
          </div>

          <div style={{ marginTop: 14, opacity: 0.7, fontSize: 13 }}>
            MVP note: one character per user (for now).
          </div>
        </div>

        {/* Inventory */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Inventory</h2>

          {!inventory || inventory.length === 0 ? (
            <p style={{ opacity: 0.8 }}>
              No items yet. (Next step: we’ll add an “Add item” button.)
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {inventory.map((it) => (
                <li key={it.id}>
                  {it.name} {it.quantity > 1 ? `× ${it.quantity}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Story text area */}
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Story</h2>
        <textarea
          value={storyText}
          readOnly
          style={{
            width: "100%",
            minHeight: 220,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ccc",
            fontFamily: "inherit",
            lineHeight: 1.4,
          }}
        />
        <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>
          MVP note: read-only. Storytellers will update this in the next phase.
        </div>
      </section>
    </main>
  );
}
