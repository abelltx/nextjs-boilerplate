"use client";

import { useState, useTransition } from "react";
import { storytellerRollEncounterAction } from "./actions";

export default function StorytellerMonsterQuickRoller(props: {
  sessionId: string;
  combatantId: string;
  combatantName: string;
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
  const initialAction = props.actionOptions?.[0] ?? null;
  const [selectedActionId, setSelectedActionId] = useState(initialAction?.id ?? "");
  const selectedAction = props.actionOptions?.find((row) => row.id === selectedActionId) ?? initialAction ?? null;
  const [actionName, setActionName] = useState(selectedAction?.name ?? "Attack");
  const [targetId, setTargetId] = useState("");
  const [attackBonus, setAttackBonus] = useState(selectedAction?.attack_bonus_override != null ? String(selectedAction.attack_bonus_override) : "");
  const [damageDice, setDamageDice] = useState(selectedAction?.damage_dice ?? "");
  const [damageBonus, setDamageBonus] = useState(selectedAction?.damage_bonus != null ? String(selectedAction.damage_bonus) : "");
  const [lastHitSuccess, setLastHitSuccess] = useState<boolean | null>(null);
  const [lastResult, setLastResult] = useState("");
  const [pending, startTransition] = useTransition();

  function run(kind: "attack" | "damage" | "both") {
    startTransition(async () => {
      try {
        const result = await storytellerRollEncounterAction({
          sessionId: props.sessionId,
          combatantId: props.combatantId,
          actionName,
          targetCombatantId: targetId || undefined,
          attackBonus: kind === "damage" ? null : attackBonus.trim() ? Number(attackBonus) : null,
          damageDice: kind === "attack" ? null : damageDice.trim() || null,
          damageBonus: kind === "attack" ? null : damageBonus.trim() ? Number(damageBonus) : null,
        });
        if (!result?.ok) throw new Error(result?.error ?? "Could not roll monster action.");
        if (kind !== "damage") setLastHitSuccess(result.hit ?? null);
        setLastResult(result.attackText || result.damageText || "");
      } catch (error: any) {
        alert(error?.message ?? "Could not roll monster action.");
      }
    });
  }

  return (
    <div className="grid grid-cols-2 gap-2 rounded border bg-white p-2">
      <div className="col-span-2 text-[11px] uppercase text-gray-500">Monster Action Roller</div>
      <select
        value={selectedActionId}
        onChange={(e) => {
          const nextId = e.currentTarget.value;
          setSelectedActionId(nextId);
          const next = props.actionOptions?.find((row) => row.id === nextId) ?? null;
          setActionName(next?.name ?? "Attack");
          setAttackBonus(next?.attack_bonus_override != null ? String(next.attack_bonus_override) : "");
          setDamageDice(next?.damage_dice ?? "");
          setDamageBonus(next?.damage_bonus != null ? String(next.damage_bonus) : "");
          setLastHitSuccess(null);
        }}
        className="rounded border px-2 py-1 text-xs"
      >
        {props.actionOptions?.length ? (
          props.actionOptions.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))
        ) : (
          <option value="">{actionName}</option>
        )}
      </select>
      <select value={targetId} onChange={(e) => setTargetId(e.currentTarget.value)} className="rounded border px-2 py-1 text-xs">
        <option value="">Choose target</option>
        {props.combatants.filter((row) => row.id !== props.combatantId).map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}{row.defense != null ? ` (AC ${row.defense})` : ""}
          </option>
        ))}
      </select>
      <input
        value={attackBonus}
        readOnly={Boolean(selectedAction)}
        onChange={(e) => setAttackBonus(e.currentTarget.value)}
        className="rounded border px-2 py-1 text-xs read-only:bg-gray-100"
        placeholder="Attack bonus"
        inputMode="numeric"
      />
      <input
        value={damageBonus}
        readOnly={Boolean(selectedAction)}
        onChange={(e) => setDamageBonus(e.currentTarget.value)}
        className="rounded border px-2 py-1 text-xs read-only:bg-gray-100"
        placeholder="Damage bonus"
        inputMode="numeric"
      />
      <input
        value={damageDice}
        readOnly={Boolean(selectedAction)}
        onChange={(e) => setDamageDice(e.currentTarget.value)}
        className="col-span-2 rounded border px-2 py-1 text-xs read-only:bg-gray-100"
        placeholder="Damage dice, e.g. 1d8 or 2d6+2"
      />
      {selectedAction?.summary ? (
        <div className="col-span-2 text-[11px] text-gray-600">{selectedAction.summary}</div>
      ) : null}
      <button
        type="button"
        className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
        disabled={pending || !targetId}
        onClick={() => run("attack")}
      >
        {pending ? "Rolling..." : "Roll Attack"}
      </button>
      <button
        type="button"
        className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
        disabled={pending || !targetId || lastHitSuccess === false}
        onClick={() => run("damage")}
      >
        {pending ? "Rolling..." : lastHitSuccess === false ? "Missed" : "Roll Damage"}
      </button>
      <button
        type="button"
        className="col-span-2 rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
        disabled={pending}
        onClick={() => run("both")}
      >
        {pending ? "Rolling..." : `Roll ${props.combatantName}`}
      </button>
      {lastHitSuccess != null ? (
        <div className="col-span-2 text-[11px] text-gray-600">{lastHitSuccess ? "Last attack hit." : "Last attack missed."}</div>
      ) : null}
      {lastResult ? (
        <div className="col-span-2 rounded border bg-gray-50 px-2 py-1 text-xs text-gray-700">{lastResult}</div>
      ) : null}
    </div>
  );
}
