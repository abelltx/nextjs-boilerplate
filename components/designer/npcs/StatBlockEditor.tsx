"use client";

import { useEffect, useMemo, useState } from "react";

type Abilities = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

type StatBlock = {
  hp: number;
  ac: number;
  speed: number;
  abilities: Abilities;
  melee_attack_bonus: number;
  ranged_attack_bonus: number;
  save_dc: number;
};

const DEFAULTS: StatBlock = {
  hp: 10,
  ac: 10,
  speed: 30,
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  melee_attack_bonus: 2,
  ranged_attack_bonus: 2,
  save_dc: 10,
};

function toInt(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function coerceInitial(initial: any): StatBlock {
  const i = initial ?? {};

  const abilitiesRaw = i.abilities ?? i.stats ?? i.ability_scores ?? {};
  const abilities: Abilities = {
    str: clamp(toInt(abilitiesRaw.str, DEFAULTS.abilities.str), 1, 30),
    dex: clamp(toInt(abilitiesRaw.dex, DEFAULTS.abilities.dex), 1, 30),
    con: clamp(toInt(abilitiesRaw.con, DEFAULTS.abilities.con), 1, 30),
    int: clamp(toInt(abilitiesRaw.int, DEFAULTS.abilities.int), 1, 30),
    wis: clamp(toInt(abilitiesRaw.wis, DEFAULTS.abilities.wis), 1, 30),
    cha: clamp(toInt(abilitiesRaw.cha, DEFAULTS.abilities.cha), 1, 30),
  };

  return {
    hp: clamp(toInt(i.hp, DEFAULTS.hp), 1, 9999),
    ac: clamp(toInt(i.ac, DEFAULTS.ac), 1, 50),
    speed: clamp(toInt(i.speed, DEFAULTS.speed), 0, 120),
    abilities,
    melee_attack_bonus: clamp(toInt(i.melee_attack_bonus, DEFAULTS.melee_attack_bonus), -5, 25),
    ranged_attack_bonus: clamp(toInt(i.ranged_attack_bonus, DEFAULTS.ranged_attack_bonus), -5, 25),
    save_dc: clamp(toInt(i.save_dc, DEFAULTS.save_dc), 1, 30),
  };
}

function squaresFromSpeed(speed: number) {
  return Math.floor(speed / 5);
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  help,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  help?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <input
        type="number"
        className="w-full border rounded-lg p-2"
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(e) => onChange(toInt(e.target.value, value))}
      />
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

export default function StatBlockEditor({ initial }: { initial: any }) {
  const [stat, setStat] = useState<StatBlock>(() => coerceInitial(initial));

  // If "initial" changes (rare on this page), keep state in sync.
  useEffect(() => {
    setStat(coerceInitial(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jsonText = useMemo(() => JSON.stringify(stat), [stat]);
  const speedSquares = useMemo(() => squaresFromSpeed(stat.speed), [stat.speed]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tactical movement uses 5 ft squares. Speed {stat.speed} ft = {speedSquares} squares.
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        <NumField
          label="HP"
          value={stat.hp}
          min={1}
          max={9999}
          onChange={(hp) => setStat((s) => ({ ...s, hp: clamp(hp, 1, 9999) }))}
        />
        <NumField
          label="AC"
          value={stat.ac}
          min={1}
          max={50}
          onChange={(ac) => setStat((s) => ({ ...s, ac: clamp(ac, 1, 50) }))}
        />
        <NumField
          label="Speed (ft)"
          value={stat.speed}
          min={0}
          max={120}
          help="5 ft per square (e.g., 30 ft = 6 squares)."
          onChange={(speed) => setStat((s) => ({ ...s, speed: clamp(speed, 0, 120) }))}
        />
      </div>

      <div className="border rounded-xl p-3 space-y-3">
        <h3 className="font-semibold">Abilities</h3>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          <NumField
            label="STR"
            value={stat.abilities.str}
            min={1}
            max={30}
            onChange={(v) =>
              setStat((s) => ({ ...s, abilities: { ...s.abilities, str: clamp(v, 1, 30) } }))
            }
          />
          <NumField
            label="DEX"
            value={stat.abilities.dex}
            min={1}
            max={30}
            onChange={(v) =>
              setStat((s) => ({ ...s, abilities: { ...s.abilities, dex: clamp(v, 1, 30) } }))
            }
          />
          <NumField
            label="CON"
            value={stat.abilities.con}
            min={1}
            max={30}
            onChange={(v) =>
              setStat((s) => ({ ...s, abilities: { ...s.abilities, con: clamp(v, 1, 30) } }))
            }
          />
          <NumField
            label="INT"
            value={stat.abilities.int}
            min={1}
            max={30}
            onChange={(v) =>
              setStat((s) => ({ ...s, abilities: { ...s.abilities, int: clamp(v, 1, 30) } }))
            }
          />
          <NumField
            label="WIS"
            value={stat.abilities.wis}
            min={1}
            max={30}
            onChange={(v) =>
              setStat((s) => ({ ...s, abilities: { ...s.abilities, wis: clamp(v, 1, 30) } }))
            }
          />
          <NumField
            label="CHA"
            value={stat.abilities.cha}
            min={1}
            max={30}
            onChange={(v) =>
              setStat((s) => ({ ...s, abilities: { ...s.abilities, cha: clamp(v, 1, 30) } }))
            }
          />
        </div>
      </div>

      <div className="border rounded-xl p-3 space-y-3">
        <h3 className="font-semibold">Attacks & Saves</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <NumField
            label="Melee Attack Bonus"
            value={stat.melee_attack_bonus}
            min={-5}
            max={25}
            onChange={(v) =>
              setStat((s) => ({ ...s, melee_attack_bonus: clamp(v, -5, 25) }))
            }
          />
          <NumField
            label="Ranged Attack Bonus"
            value={stat.ranged_attack_bonus}
            min={-5}
            max={25}
            onChange={(v) =>
              setStat((s) => ({ ...s, ranged_attack_bonus: clamp(v, -5, 25) }))
            }
          />
          <NumField
            label="Save DC"
            value={stat.save_dc}
            min={1}
            max={30}
            onChange={(v) => setStat((s) => ({ ...s, save_dc: clamp(v, 1, 30) }))}
          />
        </div>
      </div>

      {/* This is what your server action reads */}
      <input type="hidden" name="stat_block_json" value={jsonText} />

      {/* Optional: tiny debug view you can remove later */}
      <details className="opacity-70">
        <summary className="cursor-pointer text-sm">Stat block JSON</summary>
        <pre className="mt-2 text-xs border rounded-lg p-2 overflow-auto">{jsonText}</pre>
      </details>
    </div>
  );
}
