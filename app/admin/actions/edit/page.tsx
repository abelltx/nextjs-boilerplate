import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updateActionAction } from "./actions";

const COOKIE_KEY = "action_edit_id";

function isUuid(v: unknown) {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default async function ActionEditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const err = typeof sp.err === "string" ? sp.err : undefined;

  const id = cookies().get(COOKIE_KEY)?.value ?? "";
  if (!isUuid(id)) redirect("/admin/actions?err=missing_or_invalid_cookie");

  const supabase = await createClient();
  const { data: action, error } = await supabase.from("actions").select("*").eq("id", id).maybeSingle();

  if (error) redirect(`/admin/actions?err=${encodeURIComponent(error.message)}`);
  if (!action) redirect("/admin/actions?err=not_found_or_rls");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Edit Action</h1>
          <p className="text-sm text-muted-foreground">ID: {action.id}</p>
        </div>
        <a className="text-sm underline" href="/admin/actions">
          ← Back
        </a>
      </div>

      {err ? (
        <div className="rounded-lg border p-3 text-sm">
          <span className="font-semibold">Error:</span> {err}
        </div>
      ) : null}

      <form action={updateActionAction} className="space-y-6">
        <input type="hidden" name="id" value={action.id} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Name</span>
            <input
              name="name"
              defaultValue={action.name ?? ""}
              className="w-full rounded-md border px-3 py-2"
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Type</span>
            <select name="type" defaultValue={action.type ?? "other"} className="w-full rounded-md border px-3 py-2">
              <option value="melee">melee</option>
              <option value="ranged">ranged</option>
              <option value="other">other</option>
            </select>
          </label>

          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-medium">Summary</span>
            <input name="summary" defaultValue={action.summary ?? ""} className="w-full rounded-md border px-3 py-2" />
          </label>

          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-medium">Rules Text</span>
            <textarea
              name="rules_text"
              defaultValue={action.rules_text ?? ""}
              className="min-h-[140px] w-full rounded-md border px-3 py-2"
            />
          </label>

          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-medium">Tags (comma separated)</span>
            <input
              name="tags"
              defaultValue={Array.isArray(action.tags) ? action.tags.join(", ") : ""}
              className="w-full rounded-md border px-3 py-2"
              placeholder="undead, grapple, fire"
            />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_active" defaultChecked={!!action.is_active} />
            <span className="text-sm">Active</span>
          </label>
        </div>

        <div className="rounded-xl border p-4 space-y-4">
          <h2 className="font-semibold">Optional Combat Fields</h2>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="uses_attack_roll" defaultChecked={action.uses_attack_roll ?? true} />
            <span className="text-sm">Uses attack roll</span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Attack bonus override</span>
              <input
                name="attack_bonus_override"
                defaultValue={action.attack_bonus_override ?? ""}
                className="w-full rounded-md border px-3 py-2"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Damage dice</span>
              <input
                name="damage_dice"
                defaultValue={action.damage_dice ?? ""}
                className="w-full rounded-md border px-3 py-2"
                placeholder="1d8"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Damage bonus</span>
              <input
                name="damage_bonus"
                defaultValue={action.damage_bonus ?? ""}
                className="w-full rounded-md border px-3 py-2"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Damage type</span>
              <input
                name="damage_type"
                defaultValue={action.damage_type ?? ""}
                className="w-full rounded-md border px-3 py-2"
                placeholder="slashing"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Save ability</span>
              <select
                name="save_ability"
                defaultValue={action.save_ability ?? ""}
                className="w-full rounded-md border px-3 py-2"
              >
                <option value="">(none)</option>
                <option value="str">str</option>
                <option value="dex">dex</option>
                <option value="con">con</option>
                <option value="int">int</option>
                <option value="wis">wis</option>
                <option value="cha">cha</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Save DC override</span>
              <input
                name="save_dc_override"
                defaultValue={action.save_dc_override ?? ""}
                className="w-full rounded-md border px-3 py-2"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">On fail</span>
              <textarea name="on_fail" defaultValue={action.on_fail ?? ""} className="w-full rounded-md border px-3 py-2" />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">On success</span>
              <textarea
                name="on_success"
                defaultValue={action.on_success ?? ""}
                className="w-full rounded-md border px-3 py-2"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-md border px-4 py-2 font-medium">
            Save Changes
          </button>
          <span className="text-sm text-muted-foreground">Redirects to /admin/actions?saved=1 on success.</span>
        </div>
      </form>
    </div>
  );
}
