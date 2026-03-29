"use client";

import { useMemo, useState } from "react";

type SupportOptionRow = {
  id: number;
  label: string;
  trigger: string;
  grantAdvantage: boolean;
  damageBonus: string;
  consumeOnUse: boolean;
};

function newSupportOptionRow(id: number): SupportOptionRow {
  return {
    id,
    label: "",
    trigger: "next_attack_roll",
    grantAdvantage: true,
    damageBonus: "",
    consumeOnUse: true,
  };
}

export default function ActionBehaviorComposer(props: {
  defaultBehavior?: string | null;
  defaultTargetScope?: string | null;
  defaultChoiceOwner?: string | null;
  defaultSupportOptions?: Array<{
    label?: string | null;
    trigger?: string | null;
    grant_advantage?: boolean | null;
    damage_bonus?: number | null;
    consume_on_use?: boolean | null;
  }>;
  defaultActionConfigJson?: string;
}) {
  const [behavior, setBehavior] = useState<string>(String(props.defaultBehavior ?? ""));
  const [rows, setRows] = useState<SupportOptionRow[]>(
    (Array.isArray(props.defaultSupportOptions) && props.defaultSupportOptions.length
      ? props.defaultSupportOptions
          .map((row, index) => ({
            id: index + 1,
            label: String(row?.label ?? "").trim(),
            trigger: String(row?.trigger ?? "next_attack_roll").trim() || "next_attack_roll",
            grantAdvantage: Boolean(row?.grant_advantage),
            damageBonus:
              row?.damage_bonus == null || Number.isNaN(Number(row.damage_bonus)) ? "" : String(Number(row.damage_bonus)),
            consumeOnUse: row?.consume_on_use !== false,
          }))
          .filter((row) => row.trigger.length > 0)
      : [newSupportOptionRow(1)]) as SupportOptionRow[]
  );
  const nextId = useMemo(() => Math.max(0, ...rows.map((row) => row.id)) + 1, [rows]);

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
      <div>
        <h2 className="font-semibold">Behavior Config</h2>
        <p className="text-sm text-muted-foreground">
          Configure reusable action behavior from fields instead of hand-writing JSON.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Action Behavior</span>
          <select
            name="action_behavior"
            value={behavior}
            onChange={(e) => setBehavior(e.currentTarget.value)}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="">Standard Action</option>
            <option value="targeted_support">Targeted Support</option>
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Support Target</span>
          <select
            name="support_target_scope"
            defaultValue={String(props.defaultTargetScope ?? "ally")}
            className="w-full rounded-md border px-3 py-2"
            disabled={behavior !== "targeted_support"}
          >
            <option value="ally">ally</option>
            <option value="ally_or_self">ally or self</option>
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Who Chooses</span>
          <select
            name="support_choice_owner"
            defaultValue={String(props.defaultChoiceOwner ?? "target")}
            className="w-full rounded-md border px-3 py-2"
            disabled={behavior !== "targeted_support"}
          >
            <option value="target">target</option>
            <option value="source">source</option>
          </select>
        </label>
      </div>

      {behavior === "targeted_support" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Support Options</div>
              <div className="text-xs text-muted-foreground">
                Each option becomes a selectable effect on the target.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, newSupportOptionRow(nextId)])}
              className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
            >
              Add Option
            </button>
          </div>

          {rows.map((row, index) => (
            <div key={row.id} className="rounded-xl border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">Option #{index + 1}</div>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((item) => item.id !== row.id))}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-medium">Label</span>
                  <input
                    name="support_option_label"
                    value={row.label}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((item) => (item.id === row.id ? { ...item, label: e.currentTarget.value } : item))
                      )
                    }
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="e.g. Advantage on next attack roll"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Trigger</span>
                  <select
                    name="support_option_trigger"
                    value={row.trigger}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((item) => (item.id === row.id ? { ...item, trigger: e.currentTarget.value } : item))
                      )
                    }
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="next_attack_roll">next attack roll</option>
                  <option value="next_damage_roll">next damage roll</option>
                  <option value="next_skill_check">next skill check</option>
                  <option value="reroll_next_roll">reroll next roll</option>
                </select>
              </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium">Damage Bonus</span>
                  <input
                    name="support_option_damage_bonus"
                    value={row.damageBonus}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((item) => (item.id === row.id ? { ...item, damageBonus: e.currentTarget.value } : item))
                      )
                    }
                    className="w-full rounded-md border px-3 py-2"
                    inputMode="numeric"
                    placeholder="e.g. 3"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="support_option_grant_advantage"
                    checked={row.grantAdvantage}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((item) => (item.id === row.id ? { ...item, grantAdvantage: e.currentTarget.checked } : item))
                      )
                    }
                  />
                  <span>Grant advantage</span>
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="support_option_consume_on_use"
                    checked={row.consumeOnUse}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((item) => (item.id === row.id ? { ...item, consumeOnUse: e.currentTarget.checked } : item))
                      )
                    }
                  />
                  <span>Consume on use</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-medium">Advanced JSON Override</summary>
        <div className="mt-3">
          <textarea
            name="action_config_json"
            defaultValue={props.defaultActionConfigJson ?? ""}
            className="min-h-[180px] w-full rounded-md border px-3 py-2 font-mono text-sm"
            placeholder={`{\n  "kind": "targeted_support",\n  "target_scope": "ally",\n  "choice_owner": "target",\n  "options": []\n}`}
          />
        </div>
      </details>
    </div>
  );
}
