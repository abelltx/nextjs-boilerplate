"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const COOKIE_KEY = "action_edit_id";

export async function createActionAction(formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const rules_text = String(formData.get("rules_text") ?? "").trim() || null;

  if (!name) redirect("/admin/actions/new?err=missing_name");
  if (!["melee", "ranged", "other"].includes(type)) redirect("/admin/actions/new?err=bad_type");

  const { data, error } = await supabase
    .from("actions")
    .insert({ name, type, summary, rules_text })
    .select("id")
    .maybeSingle();

  if (error) redirect(`/admin/actions/new?err=${encodeURIComponent(error.message)}`);
  if (!data?.id) redirect(`/admin/actions/new?err=insert_failed`);

  // Optional: jump straight to edit by setting cookie (server action OK)
  // Next 16.0.10 types: cookies() is async -> await it before .set()
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_KEY, data.id, {
    path: "/admin/actions/edit",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 2, // 2 hours
  });

  redirect("/admin/actions/edit");
}
