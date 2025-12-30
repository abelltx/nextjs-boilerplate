"use client";

import { useEffect, useMemo, useState } from "react";

/** =========================
 *  Types (Option 2B)
 *  ========================= */

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

type Abilities = Record<AbilityKey, number>;

type NpcTrait = {
  id: string;
  name: string;
  text: string;
};

type NpcActionType = "melee" | "ranged" | "other";

type NpcAction = {
  id: string;
  name: string;
  type: NpcActionType;

  usesAttackRoll?: boolean; // default true for melee/ranged
  attackBonusOverride?: number | null;

  damage?: {
    dice: string; // e.g. "1d8"
    bonus?: number; // flat add
    type?: string; // e.g. "slashing"
  };

  save?: {
    ability: AbilityKey;
    dcOverride?: number | null;
    onFail?: string;
    onSuccess?: string;
  };

  reachSquares?: number; // melee reach in squares (1=5ft)
  rangeSquares?: { normal: number; long?: number }; // ranged in squares

  text?: string;
};

type StatBlock = {
  version: 1;

  hp: number;
  ac: number;
  speed: number; // squares (5ft squares)

  abilities: Abilities;

  melee_attack_bonus: number;
  ranged_attack_bonus: number;
  save_dc: number;

  traits: NpcTrait[];
  actions: NpcAction[];
};

const DEFAULTS: StatBlock = {
  version: 1,
  hp: 10,
  ac: 10,
  speed: 6, // 30 ft
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  melee_attack_bonus: 2,
  ranged_attack_bonus: 2,
  save_dc: 10,
  traits: [],
  actions: [],
};

/** =========================
 *  Helpers
 *  ========================= */

function uid() {
  // stable enough for UI IDs
  return Math.random().toString(36).slice(2, 10);
}

function toInt(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function looksLikeFeetSpeed(raw: number) {
  // Older stat blocks likely stored feet (30, 25, 35, 40, etc.)
  // Squares are typically 0–24-ish.
  if (!Number.isFinite(raw)) return false;
  if (raw >= 25 && raw <= 120 && raw % 5 === 0) return true;
  return false;
}

function coerceSpeedToSquares(input: any): number {
  // preferred: speed already in squares
  // legacy: speed in feet (e.g. 30) -> squares = 6
  const raw = toInt(input?.speed ?? input?.speed_ft ?? input?.speedFeet, DEFAULTS.speed);

  if (looksLikeFeetSpeed(raw)) return clamp(Math.floor(raw / 5), 0, 60);
  return clamp(raw, 0, 60);
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

  const traitsRaw = Array.isArray(i.traits) ? i.traits : [];
  const traits: NpcTrait[] = traitsRaw
    .filter(Boolean)
    .map((t: any) => ({
      id: String(t?.id ?? uid()),
      name: String(t?.name ?? "").trim(),
      text: String(t?.text ?? "").trim(),
    }))
    .filter((t: NpcTrait) => t.name.length > 0 || t.text.length > 0);

  const actionsRaw = Array.isArray(i.actions) ? i.actions : [];
  const actions: NpcAction[] = actionsRaw
    .filter(Boolean)
    .map((a: any) => {
      const type = (String(a?.type ?? "other") as NpcActionType);
      const usesAttackRoll =
        typeof a?.usesAttackRoll === "boolean"
          ? a.usesAttackRoll
          : type === "melee" || type === "ranged";

      const damage = a?.damage
        ? {
            dice: String(a.damage?.dice ?? "").trim(),
            bonus: a.damage?.bonus != null ? toInt(a.damage?.bonus, 0) : undefined,
            type: a.damage?.type != null ? String(a.damage?.type).trim() : undefined,
          }
        : undefined;

      const save = a?.save
        ? {
            ability: (String(a.save?.ability ?? "dex") as AbilityKey),
            dcOverride: a.save?.dcOverride != null ? toInt(a.save.dcOverride, 0) : null,
            onFail: a.save?.onFail != null ? String(a.save.onFail) : "",
            onSuccess: a.save?.onSuccess != null ? String(a.save.onSuccess) : "",
          }
        : undefined;

      const rangeSquares = a?.rangeSquares
        ? {
            normal: clamp(toInt(a.rangeSquares?.normal, 0), 0, 999),
            long: a.rangeSquares?.long != null ? clamp(toInt(a.rangeSquares.long, 0), 0, 999) : undefined,
          }
        : undefined;

      return {
        id: String(a?.id ?? uid()),
        name: String(a?.name ?? "").trim(),
        type: type === "melee" || type === "ranged" || type === "other" ? type : "other",
        usesAttackRoll,
        attackBonusOverride:
          a?.attackBonusOverride == null || a?.attackBonusOverride === ""
            ? null
            : clamp(toInt(a.attackBonusOverride, 0), -20, 40),
        damage: damage?.dice ? damage : undefined,
        save,
        reachSquares: a?.reachSquares != null ? clamp(toInt(a.reachSquares, 1), 0, 60) : undefined,
        rangeSquares,
        text: a?.text != null ? String(a.text) : "",
      };
    })
    .filter((a: NpcAction) => a.name.length > 0);

  return {
    version: 1,
    hp: clamp(toInt(i.hp, DEFAULTS.hp), 1, 9999),
    ac: clamp(toInt(i.ac, DEFAULTS.ac), 1, 50),
    speed: coerceSpeedToSquares(i),
    abilities,
    melee_attack_bonus: clamp(toInt(i.melee_attack_bonus, DEFAULTS.melee_attack_bonus), -5, 25),
    ranged_attack_bonus: clamp(toInt(i.ranged_attack_bonus, DEFAULTS.ranged_attack_bonus), -5, 25),
    save_dc: clamp(toInt(i.save_dc, DEFAULTS.save_dc), 1, 30),
    traits,
    actions,
  };
}

function signed(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}

function getAttackBonus(sb: StatBlock, a: NpcAction): number | null {
  if (a.usesAttackRoll === false) return null;
  if (typeof a.attackBonusOverride === "number") return a.attackBonusOverride;

  if (a.type === "melee") return sb.melee_attack_bonus;
  if (a.type === "ranged") return sb.ranged_attack_bonus;

  return null;
}

function getSaveDc(sb: StatBlock, a: NpcAction): number | null {
  if (!a.save) return null;
  if (typeof a.save.dcOverride === "number" && a.save.dcOverride > 0) return a.save.dcOverride;
  return sb.save_dc;
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

function TextField({
  label,
  value,
  onChange,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  help?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <input
        type="text"
        className="w-full border rounded-lg p-2"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <textarea
        className="w-full border rounded-lg p-2"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** =========================
 *  Main Editor (Tabs)
 *  ========================= */

export default function StatBlockEditor({ initial }: { initial: any }) {
  const [tab, setTab] = useState<"friendly" | "json">("friendly");
  const [stat, setStat] = useState<StatBlock>(() => coerceInitial(initial));
  const [jsonDraft, setJsonDraft] = useState("");

  // Keep state in sync on mount
  useEffect(() => {
    const next = coerceInitial(initial);
    setStat(next);
    setJsonDraft(JSON.stringify(next, null, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jsonText = useMemo(() => JSON.stringify(stat), [stat]);
  const speedFeet = useMemo(() => stat.speed * 5, [stat.speed]);

  // Whenever stat changes, keep jsonDraft updated IF user is on friendly tab
  useEffect(() => {
    if (tab === "friendly") setJsonDraft(JSON.stringify(stat, null, 2));
  }, [stat, tab]);

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonDraft);
      const next = coerceInitial(parsed);
      setStat(next);
    } catch (e) {
      alert("Invalid JSON. Fix formatting and try again.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("friendly")}
          className={[
            "px-3 py-2 rounded-lg border text-sm",
            tab === "friendly" ? "bg-muted/60" : "hover:bg-muted/40",
          ].join(" ")}
        >
          Friendly Editor
        </button>
        <button
          type="button"
          onClick={() => setTab("json")}
          className={[
            "px-3 py-2 rounded-lg border text-sm",
            tab === "json" ? "bg-muted/60" : "hover:bg-muted/40",
          ].join(" ")}
        >
          Advanced JSON
        </button>
        <div className="ml-auto text-xs text-muted-foreground">
          Speed: <span className="font-medium">{stat.speed}</span> squares ({speedFeet} ft)
        </div>
      </div>

      {tab === "friendly" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tactical movement uses <b>5 ft squares</b>. Speed is stored as squares.
          </p>

          {/* Core */}
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
              label="Speed (squares)"
              value={stat.speed}
              min={0}
              max={60}
              help="1 square = 5 ft (e.g., 6 squares = 30 ft)."
              onChange={(sq) => setStat((s) => ({ ...s, speed: clamp(sq, 0, 60) }))}
            />
          </div>

          {/* Abilities */}
          <div className="border rounded-xl p-3 space-y-3">
            <h3 className="font-semibold">Abilities</h3>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
              <NumField label="STR" value={stat.abilities.str} min={1} max={30}
                onChange={(v) => setStat((s) => ({ ...s, abilities: { ...s.abilities, str: clamp(v, 1, 30) } }))} />
              <NumField label="DEX" value={stat.abilities.dex} min={1} max={30}
                onChange={(v) => setStat((s) => ({ ...s, abilities: { ...s.abilities, dex: clamp(v, 1, 30) } }))} />
              <NumField label="CON" value={stat.abilities.con} min={1} max={30}
                onChange={(v) => setStat((s) => ({ ...s, abilities: { ...s.abilities, con: clamp(v, 1, 30) } }))} />
              <NumField label="INT" value={stat.abilities.int} min={1} max={30}
                onChange={(v) => setStat((s) => ({ ...s, abilities: { ...s.abilities, int: clamp(v, 1, 30) } }))} />
              <NumField label="WIS" value={stat.abilities.wis} min={1} max={30}
                onChange={(v) => setStat((s) => ({ ...s, abilities: { ...s.abilities, wis: clamp(v, 1, 30) } }))} />
              <NumField label="CHA" value={stat.abilities.cha} min={1} max={30}
                onChange={(v) => setStat((s) => ({ ...s, abilities: { ...s.abilities, cha: clamp(v, 1, 30) } }))} />
            </div>
          </div>

          {/* Attacks & Saves */}
          <div className="border rounded-xl p-3 space-y-3">
            <h3 className="font-semibold">Attacks & Saves</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <NumField
                label="Melee Attack Bonus"
                value={stat.melee_attack_bonus}
                min={-5}
                max={25}
                onChange={(v) => setStat((s) => ({ ...s, melee_attack_bonus: clamp(v, -5, 25) }))}
              />
              <NumField
                label="Ranged Attack Bonus"
                value={stat.ranged_attack_bonus}
                min={-5}
                max={25}
                onChange={(v) => setStat((s) => ({ ...s, ranged_attack_bonus: clamp(v, -5, 25) }))}
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
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Advanced mode. Edit carefully — click <b>Apply JSON</b> to re-parse into the friendly editor.
          </p>

          <textarea
            className="w-full border rounded-lg p-3 font-mono text-xs"
            rows={18}
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg border text-sm hover:bg-muted/40"
              onClick={applyJson}
            >
              Apply JSON
            </button>

            <button
              type="button"
              className="px-3 py-2 rounded-lg border text-sm hover:bg-muted/40"
              onClick={() => setJsonDraft(JSON.stringify(stat, null, 2))}
            >
              Reset from current
            </button>
          </div>
        </div>
      )}

      {/* This is what your server action reads */}
      <input type="hidden" name="stat_block_json" value={jsonText} />

      {/* Optional debug */}
      <details className="opacity-70">
        <summary className="cursor-pointer text-sm">Current StatBlock (saved)</summary>
        <pre className="mt-2 text-xs border rounded-lg p-2 overflow-auto">{jsonText}</pre>
      </details>
    </div>
  );
}
