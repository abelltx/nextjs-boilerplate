"use client";

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type StatBlock = {
  abilities?: Record<AbilityKey, number>;
  _breakdown?: {
    abilities?: Partial<Record<AbilityKey, { base?: number; gear?: number; final?: number }>>;
  };
  saves?: Partial<Record<AbilityKey, number>>;
  skills?: Record<string, number>;
  passives?: Record<string, number>;
  derived?: { hp_current?: number; hp_max?: number; defense?: number; speed?: number };
  resources?: { faith_available?: number; faith_cap?: number };
  effects?: Array<{ name: string; kind?: "buff" | "debuff"; note?: string }>;
};

function mod(score?: number) {
  const s = Number(score ?? 10);
  return Math.floor((s - 10) / 2);
}

function fmt(n: number) {
  return n >= 0 ? `+${n}` : String(n);
}

export function AbilitiesCard({ stat }: { stat: StatBlock }) {
  const a = stat.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const rows: Array<{ k: AbilityKey; label: string }> = [
    { k: "str", label: "STR" },
    { k: "dex", label: "DEX" },
    { k: "con", label: "CON" },
    { k: "int", label: "INT" },
    { k: "wis", label: "WIS" },
    { k: "cha", label: "CHA" },
  ];

  return (
    <Card title="Abilities">
      <div className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.k} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-2">
            <div className="text-[11px] text-neutral-400">{r.label}</div>
            <div className="flex items-baseline justify-between">
              {(() => {
                const info = stat._breakdown?.abilities?.[r.k];
                const base = Number(info?.base ?? a[r.k] ?? 10);
                const gear = Number(info?.gear ?? 0);
                const final = Number(info?.final ?? a[r.k] ?? 10);
                const gearText = gear >= 0 ? `+${gear}` : `${gear}`;
                const title = `(base ${base}, gear ${gearText})`;
                const colorClass =
                  gear > 0 ? "text-emerald-300" : gear < 0 ? "text-red-300" : "text-white";

                return (
                  <div className={`text-sm font-semibold ${colorClass}`} title={title}>
                    {final}
                  </div>
                );
              })()}
              <div className="text-sm text-neutral-200">{fmt(mod(a[r.k]))}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SavesCard({ stat }: { stat: StatBlock }) {
  const s = stat.saves ?? {};
  const a = stat.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

  const rows: Array<{ k: AbilityKey; label: string }> = [
    { k: "str", label: "STR Save" },
    { k: "dex", label: "DEX Save" },
    { k: "con", label: "CON Save" },
    { k: "int", label: "INT Save" },
    { k: "wis", label: "WIS Save" },
    { k: "cha", label: "CHA Save" },
  ];

  return (
    <Card title="Saving Throws">
      <div className="space-y-1">
        {rows.map((r) => {
          const bonus = mod(a[r.k]) + Number(s[r.k] ?? 0);
          return <Row key={r.k} left={r.label} right={fmt(bonus)} />;
        })}
      </div>
    </Card>
  );
}

export function SkillsCard({ stat }: { stat: StatBlock }) {
  const skills = stat.skills ?? {};
  const a = stat.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

  const skillDefs: Array<{ key: string; label: string; ability: AbilityKey }> = [
    { key: "acrobatics", label: "Acrobatics", ability: "dex" },
    { key: "animal_handling", label: "Animal Handling", ability: "wis" },
    { key: "arcana", label: "Arcana", ability: "int" },
    { key: "athletics", label: "Athletics", ability: "str" },
    { key: "deception", label: "Deception", ability: "cha" },
    { key: "history", label: "History", ability: "int" },
    { key: "insight", label: "Insight", ability: "wis" },
    { key: "intimidation", label: "Intimidation", ability: "cha" },
    { key: "investigation", label: "Investigation", ability: "int" },
    { key: "medicine", label: "Medicine", ability: "wis" },
    { key: "nature", label: "Nature", ability: "int" },
    { key: "perception", label: "Perception", ability: "wis" },
    { key: "performance", label: "Performance", ability: "cha" },
    { key: "persuasion", label: "Persuasion", ability: "cha" },
    { key: "religion", label: "Religion", ability: "int" },
    { key: "sleight_of_hand", label: "Sleight of Hand", ability: "dex" },
    { key: "stealth", label: "Stealth", ability: "dex" },
    { key: "survival", label: "Survival", ability: "wis" },
  ];

  return (
    <Card title="Skills">
      <div className="space-y-1">
        <div
          className="grid items-center rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-[11px] uppercase tracking-wide text-neutral-400"
          style={{ gridTemplateColumns: "30px 44px minmax(0, 1fr) 64px" }}
        >
          <div>Prof</div>
          <div>Mod</div>
          <div>Skill</div>
          <div className="text-right">Bonus</div>
        </div>
        {skillDefs.map((s) => {
          const abilityMod = mod(a[s.ability]);
          const hasOverride = Object.prototype.hasOwnProperty.call(skills, s.key);
          const totalBonus = hasOverride ? Number(skills[s.key] ?? 0) : abilityMod;
          const proficient = totalBonus > abilityMod;

          return (
            <div
              key={s.key}
              className="grid items-center rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2"
              style={{ gridTemplateColumns: "30px 44px minmax(0, 1fr) 64px" }}
            >
              <div>
                <span
                  className={[
                    "inline-block h-2.5 w-2.5 rounded-full border",
                    proficient ? "border-emerald-400 bg-emerald-400" : "border-neutral-500",
                  ].join(" ")}
                  title={proficient ? "Proficient" : "Not proficient"}
                />
              </div>
              <div className="text-sm uppercase text-neutral-300">{s.ability.toUpperCase()}</div>
              <div className="text-sm text-neutral-200">
                <span>{s.label}</span>
              </div>
              <div className="justify-self-end text-right text-sm font-semibold text-white">{fmt(totalBonus)}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function PassivesCard({ stat }: { stat: StatBlock }) {
  const passives = stat.passives ?? {};
  const entries = Object.entries(passives);

  return (
    <Card title="Passives">
      {entries.length === 0 ? (
        <div className="text-sm text-neutral-400">No passives set yet.</div>
      ) : (
        <div className="space-y-1">
          {entries
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, val]) => <Row key={name} left={name} right={String(val)} />)}
        </div>
      )}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: any }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 shadow-sm">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2">
      <div className="text-sm text-neutral-200">{left}</div>
      <div className="text-sm font-semibold text-white">{right}</div>
    </div>
  );
}
