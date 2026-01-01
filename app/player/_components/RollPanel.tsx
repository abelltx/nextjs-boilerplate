"use client";

import { useMemo, useState } from "react";
import type { StatBlock, AbilityKey } from "./PlayerSheetPanels";

type RollEntry = {
  id: string;
  label: string;
  formula: string;
  total: number;
  breakdown: string;
  ts: number;
};

function uid() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function mod(score?: number) {
  const s = Number(score ?? 10);
  return Math.floor((s - 10) / 2);
}

function fmtSigned(n: number) {
  return n >= 0 ? `+${n}` : String(n);
}

function rollDie(sides: number) {
  return Math.floor(Math.random() * sides) + 1;
}

function sum(arr: number[]) {
  let t = 0;
  for (const n of arr) t += n;
  return t;
}

function nowLabel(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function RollPanel(props: {
  stat: StatBlock;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [history, setHistory] = useState<RollEntry[]>([]);
  const [last, setLast] = useState<RollEntry | null>(null);

  const abilities = props.stat?.abilities ?? {
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  };

  const skills = props.stat?.skills ?? {};

  const abilityRows: Array<{ key: AbilityKey; label: string }> = useMemo(
    () => [
      { key: "str", label: "STR" },
      { key: "dex", label: "DEX" },
      { key: "con", label: "CON" },
      { key: "int", label: "INT" },
      { key: "wis", label: "WIS" },
      { key: "cha", label: "CHA" },
    ],
    []
  );

  const skillEntries = useMemo(() => {
    const entries = Object.entries(skills).map(([name, bonus]) => ({
      name,
      bonus: Number(bonus ?? 0),
    }));
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }, [skills]);

  const doRoll = (label: string, dice: { n: number; sides: number }[], bonus = 0) => {
    const rolls: number[] = [];
    for (const d of dice) {
      for (let i = 0; i < d.n; i++) rolls.push(rollDie(d.sides));
    }
    const diceTotal = sum(rolls);
    const total = diceTotal + bonus;

    const formula =
      dice
        .map((d) => (d.n === 1 ? `d${d.sides}` : `${d.n}d${d.sides}`))
        .join(" + ") + (bonus !== 0 ? ` ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}` : "");

    const breakdown =
      `[${rolls.join(", ")}]` + (bonus !== 0 ? ` ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}` : "");

    const entry: RollEntry = {
      id: uid(),
      label,
      formula,
      total,
      breakdown,
      ts: Date.now(),
    };

    setLast(entry);
    setHistory((h) => [entry, ...h].slice(0, 12));
  };

  const disabled = Boolean(props.disabled);

  return (
    <div className="space-y-4">
      {/* Dice Row */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Quick Rolls</div>
          {disabled ? (
            <div className="text-xs text-neutral-400">{props.disabledReason ?? "Disabled"}</div>
          ) : (
            <div className="text-xs text-neutral-400">Tap a die to roll</div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
          <DieButton sides={4} onClick={() => doRoll("Roll d4", [{ n: 1, sides: 4 }])} disabled={disabled} />
          <DieButton sides={6} onClick={() => doRoll("Roll d6", [{ n: 1, sides: 6 }])} disabled={disabled} />
          <DieButton sides={8} onClick={() => doRoll("Roll d8", [{ n: 1, sides: 8 }])} disabled={disabled} />
          <DieButton sides={10} onClick={() => doRoll("Roll d10", [{ n: 1, sides: 10 }])} disabled={disabled} />
          <DieButton sides={12} onClick={() => doRoll("Roll d12", [{ n: 1, sides: 12 }])} disabled={disabled} />
          <DieButton sides={20} onClick={() => doRoll("Roll d20", [{ n: 1, sides: 20 }])} disabled={disabled} />
          <DieButton sides={100} label="d100" onClick={() => doRoll("Roll d100", [{ n: 1, sides: 100 }])} disabled={disabled} />
        </div>
      </div>

      {/* Ability Checks */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
        <div className="text-sm font-semibold">Ability Checks</div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {abilityRows.map((a) => {
            const score = Number((abilities as any)[a.key] ?? 10);
            const bonus = mod(score);
            return (
              <ActionRollButton
                key={a.key}
                title={`${a.label} Check`}
                subtitle={`d20 ${fmtSigned(bonus)}`}
                onClick={() => doRoll(`${a.label} Check`, [{ n: 1, sides: 20 }], bonus)}
                disabled={disabled}
              />
            );
          })}
        </div>
      </div>

      {/* Skill Checks */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Skill Checks</div>
          <div className="text-xs text-neutral-400">
            {skillEntries.length ? `${skillEntries.length} skills` : "No skills set yet"}
          </div>
        </div>

        {skillEntries.length ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {skillEntries.map((s) => (
              <ActionRollButton
                key={s.name}
                title={s.name}
                subtitle={`d20 ${fmtSigned(s.bonus)}`}
                onClick={() => doRoll(`${s.name} Check`, [{ n: 1, sides: 20 }], s.bonus)}
                disabled={disabled}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 text-sm text-neutral-300">
            Add skill bonuses into <code className="rounded bg-neutral-900 px-1">stat_block.skills</code> to populate this list.
          </div>
        )}
      </div>

      {/* Result Console */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Roll Console</div>
          <button
            className="text-xs text-neutral-300 hover:text-white"
            onClick={() => setHistory([])}
            disabled={!history.length}
          >
            Clear
          </button>
        </div>

        {last ? (
          <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{last.label}</div>
              <div className="text-xs text-neutral-400">{nowLabel(last.ts)}</div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-neutral-400">{last.formula}</div>
                <div className="text-sm text-neutral-200">{last.breakdown}</div>
              </div>

              <div className="flex items-center gap-2">
                <div className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-lg font-bold">
                  {last.total}
                </div>
                <button
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm hover:bg-neutral-900"
                  onClick={async () => {
                    const text = `${last.label}: ${last.total} (${last.formula}) ${last.breakdown}`;
                    try {
                      await navigator.clipboard.writeText(text);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-neutral-300">Roll something to see the result here.</div>
        )}

        {history.length ? (
          <div className="mt-3 space-y-2">
            {history.map((h) => (
              <button
                key={h.id}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-left hover:bg-neutral-900/40"
                onClick={() => setLast(h)}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{h.label}</div>
                  <div className="text-xs text-neutral-400">{nowLabel(h.ts)}</div>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-xs text-neutral-400">{h.formula}</div>
                  <div className="text-sm font-bold">{h.total}</div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DieButton(props: {
  sides: number;
  label?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const text = props.label ?? `d${props.sides}`;
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={[
        "group relative rounded-2xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-center transition",
        "hover:bg-neutral-900/50 hover:border-neutral-600 active:scale-[0.99]",
        "disabled:opacity-40 disabled:hover:bg-neutral-950/40 disabled:hover:border-neutral-800 disabled:cursor-not-allowed",
      ].join(" ")}
      title={`Roll ${text}`}
    >
      <div className="text-xs uppercase tracking-wide text-neutral-400 group-hover:text-neutral-300">Roll</div>
      <div className="mt-1 text-lg font-extrabold text-white">{text}</div>
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-white/10 group-hover:ring-1" />
    </button>
  );
}

function ActionRollButton(props: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={[
        "rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3 text-left transition",
        "hover:bg-neutral-900/50 hover:border-neutral-600 active:scale-[0.99]",
        "disabled:opacity-40 disabled:hover:bg-neutral-950/40 disabled:hover:border-neutral-800 disabled:cursor-not-allowed",
      ].join(" ")}
    >
      <div className="text-sm font-semibold text-white">{props.title}</div>
      <div className="mt-1 text-xs text-neutral-400">{props.subtitle}</div>
    </button>
  );
}
