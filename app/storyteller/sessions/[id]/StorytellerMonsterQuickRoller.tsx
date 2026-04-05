"use client";

import { useState, useTransition } from "react";
import { storytellerRollEncounterAction } from "./actions";

export default function StorytellerMonsterQuickRoller(props: {
  sessionId: string;
  combatantId: string;
  combatantName: string;
  combatants: Array<{ id: string; name: string; defense?: number | null }>;
}) {
  const [actionName, setActionName] = useState("Attack");
  const [targetId, setTargetId] = useState("");
  const [attackBonus, setAttackBonus] = useState("");
  const [damageDice, setDamageDice] = useState("");
  const [damageBonus, setDamageBonus] = useState("");
  const [lastHitSuccess, setLastHitSuccess] = useState<boolean | null>(null);
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
      } catch (error: any) {
        alert(error?.message ?? "Could not roll monster action.");
      }
    });
  }

  return (
    <div className="grid grid-cols-2 gap-2 rounded border bg-white p-2">
      <div className="col-span-2 text-[11px] uppercase text-gray-500">Monster Action Roller</div>
      <input
        value={actionName}
        onChange={(e) => setActionName(e.currentTarget.value)}
        className="rounded border px-2 py-1 text-xs"
        placeholder="Action name"
      />
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
        onChange={(e) => setAttackBonus(e.currentTarget.value)}
        className="rounded border px-2 py-1 text-xs"
        placeholder="Attack bonus"
        inputMode="numeric"
      />
      <input
        value={damageBonus}
        onChange={(e) => setDamageBonus(e.currentTarget.value)}
        className="rounded border px-2 py-1 text-xs"
        placeholder="Damage bonus"
        inputMode="numeric"
      />
      <input
        value={damageDice}
        onChange={(e) => setDamageDice(e.currentTarget.value)}
        className="col-span-2 rounded border px-2 py-1 text-xs"
        placeholder="Damage dice, e.g. 1d8 or 2d6+2"
      />
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
    </div>
  );
}
