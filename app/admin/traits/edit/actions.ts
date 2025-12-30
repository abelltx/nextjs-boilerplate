"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

// Used by the LIST page (POST) to open the editor
export async function openTraitEditAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!isUuid(id)) redirect("/admin/traits");

  const c = await cookies();
  c.set("trait_edit_id", id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 5,
  });

  redirect("/admin/traits/edit");
}

// Used by the EDIT page (Save button)
export async function updateTraitAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!isUuid(id)) redirect("/admin/traits");

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();

  const isActiveRaw = String(formData.get("is_active") ?? "off");
  const is_active = isActiveRaw === "on" || isActiveRaw === "true";

  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const tags =
    tagsRaw.length === 0
      ? null
      : tagsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  if (!name) {
    redirect(`/admin/traits/edit?err=${encodeURIComponent("Name is required")}`);
  }

  // Optional: enforce known types (adjust if you add more)
  const allowedTypes = new Set([
    "nature",
    "training",
    "affliction",
    "calling",
    "office",
  ]);
  const safeType = allowedTypes.has(type) ? type : "nature";

  const supabase = await createClient();
  const { error } = await supabase
    .from("traits")
    .update({
      name,
      type: safeType,
      summary: summary.length ? summary : null,
      tags,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    // If RLS blocks update, you'll see it here
    redirect(
      `/admin/traits/edit?err=${encodeURIComponent(error.message)}`
    );
  }

  // After save, bounce back to list
  redirect("/admin/traits?saved=1");
}
