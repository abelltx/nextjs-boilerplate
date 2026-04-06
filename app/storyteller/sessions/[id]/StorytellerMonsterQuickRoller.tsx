"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { storytellerAddEncounterLogNote, storytellerApplyEncounterDamageAction } from "./actions";

export default function StorytellerMonsterQuickRoller(props: {
  sessionId: string;
  combatantId: string;
  combatantName: string;
  combatantHpCurrent?: number | null;
  combatants: Array<{ id: string; name: string; defense?: number | null }>;
  actionOptions?: Array<{
    id: string;
    name: string;
    summary?: string | null;
    range_normal?: number | null;
    attack_bonus_override?: number | null;
    damage_dice?: string | null;
    damage_bonus?: number | null;
  }>;
}) {
  const isDefeated = Number.isFinite(Number(props.combatantHpCurrent ?? NaN)) && Number(props.combatantHpCurrent) <= 0;
  const normalizedActions = useMemo(
    () =>
      props.actionOptions?.length
        ? props.actionOptions
        : [{ id: "", name: props.combatantName ? `${props.combatantName} Attack` : "Attack" }],
    [props.actionOptions, props.combatantName]
  );
  const initialAction = normalizedActions[0] ?? null;
  const [selectedActionId, setSelectedActionId] = useState(initialAction?.id ?? "");
  const selectedAction = normalizedActions.find((row) => row.id === selectedActionId) ?? initialAction ?? null;
  const defaultTargetId = useMemo(
    () =>
      String(
        props.combatants.find((row) => row.id !== props.combatantId)?.id ??
          props.combatants[0]?.id ??
          ""
      ).trim(),
    [props.combatants, props.combatantId]
  );
  const [targetId, setTargetId] = useState(defaultTargetId);
  const [attackBonus, setAttackBonus] = useState(selectedAction?.attack_bonus_override != null ? String(selectedAction.attack_bonus_override) : "");
  const [damageDice, setDamageDice] = useState(selectedAction?.damage_dice ?? "");
  const [damageBonus, setDamageBonus] = useState(selectedAction?.damage_bonus != null ? String(selectedAction.damage_bonus) : "");
  const [lastHitSuccess, setLastHitSuccess] = useState<boolean | null>(null);
  const [lastResult, setLastResult] = useState("");
  const [pending, startTransition] = useTransition();

  function rollDie(sides: number) {
    return Math.floor(Math.random() * Math.max(2, sides)) + 1;
  }

  useEffect(() => {
    const nextAction = normalizedActions.find((row) => row.id === selectedActionId) ?? normalizedActions[0] ?? null;
    setSelectedActionId(nextAction?.id ?? "");
    setAttackBonus(nextAction?.attack_bonus_override != null ? String(nextAction.attack_bonus_override) : "");
    setDamageDice(nextAction?.damage_dice ?? "");
    setDamageBonus(nextAction?.damage_bonus != null ? String(nextAction.damage_bonus) : "");
  }, [normalizedActions, selectedActionId]);

  useEffect(() => {
    if (!targetId && defaultTargetId) {
      setTargetId(defaultTargetId);
    }
  }, [targetId, defaultTargetId]);

  function run(kind: "attack" | "damage") {
    startTransition(async () => {
      try {
        if (isDefeated) throw new Error(`${props.combatantName} is defeated and cannot act.`);
        const target = props.combatants.find((row) => String(row.id) === String(targetId)) ?? null;
        const actionName = selectedAction?.name ?? props.combatantName ?? "Attack";
        const targetLabel = String(target?.name ?? "").trim();
        if (!targetLabel) throw new Error("Choose a target first.");

        if (kind === "attack") {
          const bonus = Number(attackBonus.trim() || 0);
          const d20 = rollDie(20);
          const total = d20 + bonus;
          const targetDefense = Number.isFinite(Number(target?.defense ?? NaN)) ? Number(target?.defense) : null;
          if (targetDefense == null) throw new Error(`${targetLabel} has no defense/AC set yet.`);
          const hitSuccess = total >= targetDefense;
          const attackText = `${props.combatantName} uses ${actionName} vs ${targetLabel}: hit roll ${total} (d20 ${d20}${bonus ? ` + ${bonus}` : ""}) against AC ${targetDefense} ${hitSuccess ? "HIT" : "MISS"}.`;
          setLastHitSuccess(hitSuccess);
          setLastResult(attackText);
          await storytellerAddEncounterLogNote({
            sessionId: props.sessionId,
            text: attackText,
          });
          return;
        }

        if (lastHitSuccess !== true) throw new Error("Roll attack first, and only roll damage after a hit.");
        const formula = String(damageDice ?? "").trim().toLowerCase();
        const match = formula.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
        if (!match) throw new Error("Damage dice must look like 1d8 or 2d6+3.");
        const count = Math.max(1, Number(match[1] || 1));
        const sides = Math.max(2, Number(match[2] || 2));
        const inlineBonus = Number(match[3] || 0);
        const flatBonus = Number(damageBonus.trim() || 0);
        const rolls = Array.from({ length: count }, () => rollDie(sides));
        const total = rolls.reduce((sum, n) => sum + n, 0) + inlineBonus + flatBonus;
        const totalBonus = inlineBonus + flatBonus;
        const damageText = `${props.combatantName} uses ${actionName} vs ${targetLabel}: damage ${total} from [${rolls.join(", ")}]${totalBonus ? ` ${totalBonus > 0 ? "+" : "-"} ${Math.abs(totalBonus)}` : ""}.`;
        setLastResult(damageText);
        await storytellerApplyEncounterDamageAction({
          sessionId: props.sessionId,
          targetCombatantId: targetId,
          amount: total,
          sourceText: damageText,
        });
      } catch (error: any) {
        alert(error?.message ?? "Could not roll monster action.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded border bg-white p-2">
      <div className="text-[11px] uppercase text-gray-500">Monster Ability</div>
      <div className="flex flex-wrap gap-2">
        {normalizedActions.map((row) => {
          const active = selectedActionId === row.id;
          return (
            <button
              key={row.id || row.name}
              type="button"
              onClick={() => {
                setSelectedActionId(row.id);
                setAttackBonus(row.attack_bonus_override != null ? String(row.attack_bonus_override) : "");
                setDamageDice(row.damage_dice ?? "");
                setDamageBonus(row.damage_bonus != null ? String(row.damage_bonus) : "");
                setLastHitSuccess(null);
                setLastResult("");
              }}
              className={[
                "rounded border px-3 py-1.5 text-xs font-semibold",
                active ? "border-blue-400 bg-blue-50 text-blue-900" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              {row.name}
            </button>
          );
        })}
      </div>
      <label className="block text-[11px] uppercase text-gray-500">
        Target
        <select value={targetId} onChange={(e) => setTargetId(e.currentTarget.value)} className="mt-1 w-full rounded border px-2 py-1 text-xs">
          <option value="">Choose target</option>
          {props.combatants.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}{row.defense != null ? ` (AC ${row.defense})` : " (AC missing)"}
          </option>
          ))}
        </select>
      </label>
      {selectedAction?.name ? (
        <div className="rounded border bg-slate-50 px-2 py-2">
          <div className="text-sm font-semibold text-slate-900">{selectedAction.name}</div>
          {selectedAction?.summary ? (
            <div className="mt-1 text-[11px] text-gray-600">{selectedAction.summary}</div>
          ) : null}
          <div className="mt-1 text-[11px] text-gray-600">
            {attackBonus ? `Hit +${attackBonus}` : "No hit bonus"}
            {damageDice ? ` | Damage ${damageDice}${damageBonus ? ` + ${damageBonus}` : ""}` : ""}
            {selectedAction?.range_normal ? ` | Range ${selectedAction.range_normal} ft` : ""}
          </div>
        </div>
      ) : null}
      {!props.actionOptions?.length ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
          No NPC abilities were resolved for this combatant yet. The encounter enemy may be missing its NPC link or action ids.
        </div>
      ) : null}
      {isDefeated ? (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-900">
          {props.combatantName} is defeated and cannot roll actions.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
          disabled={pending || !targetId || isDefeated}
          onClick={() => run("attack")}
        >
          {pending ? "Rolling..." : "Roll Attack"}
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
          disabled={pending || !targetId || !damageDice.trim() || lastHitSuccess !== true || isDefeated}
          onClick={() => run("damage")}
        >
          {pending ? "Rolling..." : lastHitSuccess === false ? "Missed" : "Roll Damage"}
        </button>
      </div>
      {!targetId ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
          Choose a target to enable the monster roll buttons.
        </div>
      ) : null}
      {selectedAction && !damageDice.trim() ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
          This ability is loaded, but it has no damage formula yet.
        </div>
      ) : null}
      {lastHitSuccess != null ? (
        <div className="text-[11px] text-gray-600">{lastHitSuccess ? "Last attack hit." : "Last attack missed."}</div>
      ) : null}
      {lastResult ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-2 text-sm text-emerald-900">
          {lastResult}
        </div>
      ) : null}
    </div>
  );
}
