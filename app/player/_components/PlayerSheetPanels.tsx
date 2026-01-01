"use client";

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type StatBlock = {
  abilities?: Record<AbilityKey, number>;
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
              <div className="text-sm font-semibold text-white">{a[r.k]}</div>
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
  const entries = Object.entries(skills);

  return (
    <Card title="Skills">
      {entries.length === 0 ? (
        <div className="text-sm text-neutral-400">No skills set yet.</div>
      ) : (
        <div className="space-y-1">
          {entries
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, bonus]) => <Row key={name} left={name} right={fmt(Number(bonus ?? 0))} />)}
        </div>
      )}
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
