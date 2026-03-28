import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updateActionAction, deleteActionAction } from "./actions";
import DeleteActionButton from "./DeleteActionButton";
import ActionDamageRollClient from "../ActionDamageRollClient";

const COOKIE_KEY = "action_edit_id";
const DAMAGE_DICE_OPTIONS = [
  "",
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "1d12",
  "2d4",
  "2d6",
  "2d8",
  "2d10",
  "2d12",
  "3d6",
  "4d6",
];
const DAMAGE_TYPE_OPTIONS = [
  "",
  "bludgeoning",
  "piercing",
  "slashing",
  "acid",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "poison",
  "psychic",
  "radiant",
  "thunder",
  "healing",
  "temporary_hp",
  "utility",
];
const ACTION_BEHAVIOR_OPTIONS = [
  { value: "", label: "Standard Action" },
  { value: "targeted_support", label: "Targeted Support" },
];

function isUuid(v: unknown) {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export default async function ActionEditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const err = typeof sp.err === "string" ? sp.err : undefined;
  const idFromQueryRaw = typeof sp.id === "string" ? sp.id.trim() : "";

  const cookieStore = await cookies();
  const id = isUuid(idFromQueryRaw) ? idFromQueryRaw : cookieStore.get(COOKIE_KEY)?.value ?? "";
  if (!isUuid(id)) redirect("/admin/actions?err=missing_or_invalid_cookie");

  const supabase = await createClient();
  const { data: action, error } = await supabase
    .from("actions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) redirect(`/admin/actions?err=${encodeURIComponent(error.message)}`);
  if (!action) redirect("/admin/actions?err=not_found_or_rls");
  const actionTags = Array.isArray(action.tags) ? action.tags.map((v: any) => String(v ?? "").trim()).filter(Boolean) : [];
  const actionConfig = action && typeof action.action_config === "object" && action.action_config ? (action.action_config as any) : null;
  const supportOptions = Array.isArray(actionConfig?.options) ? (actionConfig.options as any[]) : [];
  const supportAttackAdvantage = supportOptions.some((opt: any) => String(opt?.trigger ?? "").trim().toLowerCase() === "next_attack_roll" && Boolean(opt?.grant_advantage));
  const supportDamageBonus =
    supportOptions.find((opt: any) => String(opt?.trigger ?? "").trim().toLowerCase() === "next_damage_roll")?.damage_bonus ?? "";
  const actionBehavior = String(actionConfig?.kind ?? "").trim().toLowerCase() === "targeted_support" ? "targeted_support" : "";

  return (
    <div className="mx-auto w-full max-w-5xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit Action</h1>
          <p className="text-sm text-muted-foreground">ID: {action.id}</p>
        </div>
        <a className="text-sm underline text-muted-foreground hover:text-foreground" href="/admin/actions">
          ← Back
        </a>
      </div>

      {err ? (
        <div className="rounded-xl border p-3 text-sm">
          <span className="font-semibold">Error:</span> {err}
        </div>
      ) : null}

      <form action={updateActionAction} className="space-y-6">
        <input type="hidden" name="id" value={action.id} />

        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Core Details</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={!!action.is_active} />
              <span>Active</span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Name</span>
              <input
                name="name"
                defaultValue={action.name ?? ""}
                className="w-full rounded-lg border px-3 py-2"
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Type</span>
              <select
                name="type"
                defaultValue={action.type ?? "other"}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="melee">melee</option>
                <option value="ranged">ranged</option>
                <option value="other">other</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Action Behavior</span>
              <select
                name="action_behavior"
                defaultValue={actionBehavior}
                className="w-full rounded-lg border px-3 py-2"
              >
                {ACTION_BEHAVIOR_OPTIONS.map((opt) => (
                  <option key={opt.value || "standard"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Use this for special nonstandard action flows that target another character.
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Support Target</span>
              <select
                name="support_target_scope"
                defaultValue={String(actionConfig?.target_scope ?? "ally")}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="ally">ally</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Who Chooses</span>
              <select
                name="support_choice_owner"
                defaultValue={String(actionConfig?.choice_owner ?? "target")}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="target">target</option>
                <option value="source">source</option>
              </select>
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Summary</span>
              <input
                name="summary"
                defaultValue={action.summary ?? ""}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Rules Text</span>
              <textarea
                name="rules_text"
                defaultValue={action.rules_text ?? ""}
                className="min-h-[140px] w-full rounded-lg border px-3 py-2"
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Tags (comma separated)</span>
              <input
                name="tags"
                defaultValue={actionTags.join(", ")}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="undead, grapple, fire"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold">Support Effects</h2>
            <p className="text-sm text-muted-foreground">
              These options are used when <code>Action Behavior</code> is set to <code>Targeted Support</code>.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="support_grant_attack_roll_advantage"
                defaultChecked={supportAttackAdvantage}
              />
              <span>Grant advantage on next attack roll</span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Next-hit damage bonus</span>
              <input
                name="support_damage_bonus"
                defaultValue={supportDamageBonus}
                className="w-full rounded-lg border px-3 py-2"
                inputMode="numeric"
                placeholder="e.g. 3"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Resolution (Damage / Healing / Utility)</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="uses_attack_roll"
                defaultChecked={action.uses_attack_roll ?? true}
              />
              <span>Uses attack roll</span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Attack bonus override</span>
              <input
                name="attack_bonus_override"
                defaultValue={action.attack_bonus_override ?? ""}
                className="w-full rounded-lg border px-3 py-2"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Range normal (ft)</span>
              <input
                name="range_normal"
                defaultValue={action.range_normal ?? ""}
                className="w-full rounded-lg border px-3 py-2"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Range max (ft)</span>
              <input
                name="range_max"
                defaultValue={action.range_max ?? ""}
                className="w-full rounded-lg border px-3 py-2"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Effect dice formula</span>
              <select
                name="damage_dice"
                defaultValue={action.damage_dice ?? ""}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="">(none)</option>
                {DAMAGE_DICE_OPTIONS.filter(Boolean).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Effect bonus</span>
              <input
                name="damage_bonus"
                defaultValue={action.damage_bonus ?? ""}
                className="w-full rounded-lg border px-3 py-2"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Effect type</span>
              <select
                name="damage_type"
                defaultValue={action.damage_type ?? ""}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="">(none)</option>
                {DAMAGE_TYPE_OPTIONS.filter(Boolean).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Choose <code>healing</code> or <code>temporary_hp</code> for healing actions.
              </span>
            </label>

            <div className="md:col-span-2 rounded-lg border p-3">
              <div className="mb-2 text-sm font-medium">Damage Roll Preview</div>
              <ActionDamageRollClient
                damageDice={action.damage_dice ?? null}
                damageBonus={action.damage_bonus ?? null}
                damageType={action.damage_type ?? null}
              />
              <div className="mt-2 text-xs text-muted-foreground">
                Uses currently saved values. Click Save Changes first, then Roll.
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Save ability</span>
              <select
                name="save_ability"
                defaultValue={action.save_ability ?? ""}
                className="w-full rounded-lg border px-3 py-2"
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
                className="w-full rounded-lg border px-3 py-2"
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">On fail</span>
              <textarea
                name="on_fail"
                defaultValue={action.on_fail ?? ""}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">On success</span>
              <textarea
                name="on_success"
                defaultValue={action.on_success ?? ""}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-lg border px-4 py-2 font-medium shadow-sm hover:bg-muted">
            Save Changes
          </button>
          <span className="text-sm text-muted-foreground">
            Saves and redirects to <code className="rounded border px-1 py-0.5">/admin/actions?saved=1</code>.
          </span>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-red-800">Danger Zone</h2>
            <p className="text-sm text-red-800/80">
              Deleting an action is permanent and cannot be undone.
            </p>
          </div>

          <DeleteActionButton id={action.id} action={deleteActionAction} />
        </div>
      </div>
    </div>
  );
}
