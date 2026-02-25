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
  passiveNotes?: Array<{ source: string; text: string }>;
  advantages?: Record<string, string[]>;
  derived?: { hp_current?: number; hp_max?: number; defense?: number; speed?: number };
  resources?: { faith_available?: number; faith_cap?: number };
  effects?: Array<{ name: string; kind?: "buff" | "debuff"; note?: string }>;
};

type RollClickMeta = { label: string; total: number; breakdown?: string };

function mod(score?: number) {
  const s = Number(score ?? 10);
  return Math.floor((s - 10) / 2);
}

function abilityGearBonus(stat: StatBlock, key: AbilityKey) {
  const info = stat._breakdown?.abilities?.[key];
  const gear = Number(info?.gear ?? 0);
  return Number.isFinite(gear) ? gear : 0;
}

function fmt(n: number) {
  return n >= 0 ? `+${n}` : String(n);
}

export function AbilitiesCard({
  stat,
  highlightAbility = null,
  onAbilityRoll,
  rollLocked = false,
  advantageByAbility,
}: {
  stat: StatBlock;
  highlightAbility?: AbilityKey | null;
  onAbilityRoll?: (ability: AbilityKey, meta: RollClickMeta, fromRect: DOMRect) => void;
  rollLocked?: boolean;
  advantageByAbility?: Partial<Record<AbilityKey, boolean>>;
}) {
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
        {rows.map((r) => {
          const hasAdvantage = Boolean(advantageByAbility?.[r.k]);
          return (
            <button
            type="button"
            key={r.k}
            onClick={(e) => {
              const score = Number(a[r.k] ?? 10);
              const bonus = mod(score) + abilityGearBonus(stat, r.k);
              const rollA = Math.floor(Math.random() * 20) + 1;
              const rollB = hasAdvantage ? Math.floor(Math.random() * 20) + 1 : null;
              const roll = rollB == null ? rollA : Math.max(rollA, rollB);
              const total = roll + bonus;
              onAbilityRoll?.(
                r.k,
                {
                  label: `${r.label} Check`,
                  total,
                  breakdown:
                    rollB == null
                      ? `d20(${roll}) ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}`
                      : `Advantage roll: ${rollA} and ${rollB}, kept ${roll}, ${bonus >= 0 ? "+" : "-"}${Math.abs(bonus)} bonus`,
                },
                e.currentTarget.getBoundingClientRect()
              );
            }}
            disabled={rollLocked}
            className={[
              "rounded-xl border bg-neutral-950/40 p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
              highlightAbility === r.k
                ? "border-green-300 bg-green-500/15 shadow-[0_0_0_2px_rgba(74,222,128,0.8),0_0_24px_rgba(34,197,94,0.95),0_0_44px_rgba(34,197,94,0.55)] animate-pulse"
                : "border-neutral-800",
            ].join(" ")}
          >
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
              <div className="flex items-center gap-2">
                {hasAdvantage ? (
                  <span className="rounded border border-emerald-300/60 bg-emerald-500/20 px-1 py-0 text-[10px] font-semibold text-emerald-200">
                    ADV
                  </span>
                ) : null}
                <div className="text-sm text-neutral-200">{fmt(mod(a[r.k]))}</div>
              </div>
            </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export function SavesCard({ stat, highlightAbility = null }: { stat: StatBlock; highlightAbility?: AbilityKey | null }) {
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
      <div className="grid grid-cols-2 gap-1">
        {rows.map((r) => {
          const bonus = mod(a[r.k]) + Number(s[r.k] ?? 0);
          return (
            <div
              key={r.k}
              className={[
                "flex items-center justify-between rounded-lg border bg-neutral-950/40 px-2 py-1.5",
                highlightAbility === r.k
                  ? "border-green-300 bg-green-500/15 shadow-[0_0_0_2px_rgba(74,222,128,0.8),0_0_20px_rgba(34,197,94,0.7)]"
                  : "border-neutral-800",
              ].join(" ")}
            >
              <div className="text-xs text-neutral-300">{r.k.toUpperCase()}</div>
              <div className="text-sm font-semibold text-white">{fmt(bonus)}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function SkillsCard({
  stat,
  highlightSkill = null,
  onSkillRoll,
  rollLocked = false,
  advantageBySkill,
}: {
  stat: StatBlock;
  highlightSkill?: string | null;
  onSkillRoll?: (skillKey: string, meta: RollClickMeta, fromRect: DOMRect) => void;
  rollLocked?: boolean;
  advantageBySkill?: Record<string, boolean>;
}) {
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
          className="grid items-center rounded-lg border border-neutral-800 bg-neutral-950/40 px-2 py-2 text-[10px] uppercase tracking-wide text-neutral-400"
          style={{ gridTemplateColumns: "22px 34px minmax(0, 1fr) 74px" }}
        >
          <div>Prof</div>
          <div>Mod</div>
          <div>Skill</div>
          <div className="text-right">Bonus</div>
        </div>
        {skillDefs.map((s) => {
          const abilityBonus = mod(a[s.ability]) + abilityGearBonus(stat, s.ability);
          const hasOverride = Object.prototype.hasOwnProperty.call(skills, s.key);
          const totalBonus = hasOverride ? Number(skills[s.key] ?? 0) + abilityGearBonus(stat, s.ability) : abilityBonus;
          const proficient = totalBonus > abilityBonus;

          const hasAdvantage = Boolean(advantageBySkill?.[s.key]);
          return (
            <button
              type="button"
              key={s.key}
              onClick={(e) => {
                const rollA = Math.floor(Math.random() * 20) + 1;
                const rollB = hasAdvantage ? Math.floor(Math.random() * 20) + 1 : null;
                const roll = rollB == null ? rollA : Math.max(rollA, rollB);
                const total = roll + totalBonus;
                onSkillRoll?.(
                  s.key,
                  {
                    label: `${s.label} Check`,
                    total,
                    breakdown:
                      rollB == null
                        ? `d20(${roll}) ${totalBonus >= 0 ? "+" : "-"} ${Math.abs(totalBonus)}`
                        : `Advantage roll: ${rollA} and ${rollB}, kept ${roll}, ${totalBonus >= 0 ? "+" : "-"}${Math.abs(totalBonus)} bonus`,
                  },
                  e.currentTarget.getBoundingClientRect()
                );
              }}
              disabled={rollLocked}
              className={[
                "grid items-center rounded-lg border bg-neutral-950/40 px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                highlightSkill === s.key
                  ? "border-green-300 bg-green-500/15 shadow-[0_0_0_2px_rgba(74,222,128,0.8),0_0_24px_rgba(34,197,94,0.95),0_0_44px_rgba(34,197,94,0.55)] animate-pulse"
                  : "border-neutral-800",
              ].join(" ")}
              style={{ gridTemplateColumns: "22px 34px minmax(0, 1fr) 74px" }}
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
              <div className="text-xs uppercase text-neutral-300">{s.ability.toUpperCase()}</div>
              <div className="min-w-0 text-[13px] text-neutral-200">
                <span className="block truncate whitespace-nowrap" title={s.label}>
                  {s.label}
                </span>
              </div>
              <div className="justify-self-end flex w-full items-center justify-end gap-1 whitespace-nowrap text-right text-[13px] font-semibold text-white">
                {hasAdvantage ? (
                  <span className="rounded border border-emerald-300/60 bg-emerald-500/20 px-1 py-0 text-[10px] font-semibold text-emerald-200">
                    ADV
                  </span>
                ) : null}
                <span>{fmt(totalBonus)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export function PassivesCard({ stat }: { stat: StatBlock }) {
  const passives = stat.passives ?? {};
  const entries = Object.entries(passives);
  const passiveNotes = Array.isArray(stat.passiveNotes) ? stat.passiveNotes : [];

  return (
    <Card title="Passives">
      {entries.length === 0 && passiveNotes.length === 0 ? (
        <div className="text-sm text-neutral-400">No passives set yet.</div>
      ) : (
        <div className="space-y-1">
          {passiveNotes.map((p, i) => (
            <div
              key={`${p.source}-${p.text}-${i}`}
              className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2"
            >
              <div className="text-sm font-semibold text-white">{p.source}</div>
              <div className="mt-1 text-sm text-neutral-200">{p.text}</div>
            </div>
          ))}
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
