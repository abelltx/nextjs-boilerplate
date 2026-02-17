"use client";

import { useState } from "react";

function rollDie(sides: number) {
  return Math.floor(Math.random() * sides) + 1;
}

function parseDice(formula: string) {
  const m = String(formula ?? "").trim().toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  return {
    count: Math.max(1, Number(m[1] || 1)),
    sides: Math.max(2, Number(m[2] || 2)),
    inlineBonus: Number(m[3] || 0),
  };
}

export default function ActionDamageRollClient(props: {
  damageDice?: string | null;
  damageBonus?: number | null;
  damageType?: string | null;
}) {
  const [result, setResult] = useState<string>("");
  const parsed = parseDice(props.damageDice ?? "");
  const bonusFromField = Number(props.damageBonus ?? 0);
  const canRoll = Boolean(parsed);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canRoll}
        onClick={() => {
          if (!parsed) return;
          const rolls = Array.from({ length: parsed.count }, () => rollDie(parsed.sides));
          const bonus = (Number.isFinite(parsed.inlineBonus) ? parsed.inlineBonus : 0) + (Number.isFinite(bonusFromField) ? bonusFromField : 0);
          const total = rolls.reduce((t, n) => t + n, 0) + bonus;
          setResult(
            `${total} ([${rolls.join(", ")}]${bonus ? ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}` : ""}${props.damageType ? ` ${props.damageType}` : ""})`
          );
        }}
      >
        Roll
      </button>
      {result ? <span className="text-xs text-emerald-700">{result}</span> : null}
    </div>
  );
}

