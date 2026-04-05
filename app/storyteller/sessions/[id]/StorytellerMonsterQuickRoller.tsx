"use client";

import { useState, useTransition } from "react";
import { storytellerRollEncounterAction } from "./actions";

export default function StorytellerMonsterQuickRoller(props: {
  sessionId: string;
  combatantId: string;
  combatantName: string;
}) {
  const [actionName, setActionName] = useState("Attack");
  const [targetName, setTargetName] = useState("");
  const [attackBonus, setAttackBonus] = useState("");
  const [damageDice, setDamageDice] = useState("");
  const [damageBonus, setDamageBonus] = useState("");
  const [pending, startTransition] = useTransition();

  function run(kind: "attack" | "damage" | "both") {
    startTransition(async () => {
      try {
        await storytellerRollEncounterAction({
          sessionId: props.sessionId,
          combatantId: props.combatantId,
          actionName,
          targetName: targetName.trim() || undefined,
          attackBonus: kind === "damage" ? null : attackBonus.trim() ? Number(attackBonus) : null,
          damageDice: kind === "attack" ? null : damageDice.trim() || null,
          damageBonus: kind === "attack" ? null : damageBonus.trim() ? Number(damageBonus) : null,
        });
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
      <input
        value={targetName}
        onChange={(e) => setTargetName(e.currentTarget.value)}
        className="rounded border px-2 py-1 text-xs"
        placeholder="Target name"
      />
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
        disabled={pending}
        onClick={() => run("attack")}
      >
        {pending ? "Rolling..." : "Roll Attack"}
      </button>
      <button
        type="button"
        className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
        disabled={pending}
        onClick={() => run("damage")}
      >
        {pending ? "Rolling..." : "Roll Damage"}
      </button>
      <button
        type="button"
        className="col-span-2 rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
        disabled={pending}
        onClick={() => run("both")}
      >
        {pending ? "Rolling..." : `Roll ${props.combatantName}`}
      </button>
    </div>
  );
}
