"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export async function openTraitEditAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!isUuid(id)) {
    redirect("/admin/traits");
  }

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
