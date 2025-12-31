"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const COOKIE_KEY = "item_edit_id";
const COOKIE_PATH = "/admin/items/edit";

export async function createItemAction(formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!name || !category) redirect("/admin/items/new");

  const { data, error } = await supabase
    .from("items")
    .insert({
      name,
      category,
      rarity: (String(formData.get("rarity") ?? "").trim() || null) as string | null,
      summary: (String(formData.get("summary") ?? "").trim() || null) as string | null,
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.error("createItemAction error:", error?.message);
    redirect("/admin/items/new");
  }

  const c = await cookies();
  c.set(COOKIE_KEY, data.id, {
    path: COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax",
  });

  redirect("/admin/items/edit");
}
