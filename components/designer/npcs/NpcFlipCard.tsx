"use client";

import { useState } from "react";
import { motion } from "framer-motion";

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
type Abilities = Record<AbilityKey, number>;

type NpcTrait = { id: string; name: string; text: string };

type NpcActionType = "melee" | "ranged" | "other";
type NpcAction = {
  id: string;
  name: string;
  type: NpcActionType;
  usesAttackRoll?: boolean;
  attackBonusOverride?: number | null;
  damage?: { dice: string; bonus?: number; type?: string };
  save?: { ability: AbilityKey; dcOverride?: number | null; onFail?: string; onSuccess?: string };
};

type NpcCardModel = {
  id: string;
  name: string;
  image_url?: string | null;

  ac?: number | null;
  hp?: number | null;
  speed?: string | null;

  attack_bonus?: number | null; // fallback if action has no override
  save_dc?: number | null;      // fallback if action has no override

  abilities?: Partial<Abilities> | null;

  traits?: NpcTrait[] | null;
  actions?: NpcAction[] | null;
};

function mod(n?: number | null) {
  const v = Number(n ?? 10);
  return Math.floor((v - 10) / 2);
}
function fmtMod(n?: number | null) {
  const m = mod(n);
  return m >= 0 ? `+${m}` : `${m}`;
}

export default function NpcFlipCard({ npc }: { npc: NpcCardModel }) {
  const [flipped, setFlipped] = useState(false);

  const ab = npc.abilities ?? {};
  const atkFallback = npc.attack_bonus ?? 0;
  const dcFallback = npc.save_dc ?? 10;

  return (
    <button
      type="button"
      onClick={() => setFlipped((s) => !s)}
      className="group relative w-full text-left"
      aria-label={`Flip card for ${npc.name}`}
    >
      {/* outer gives perspective */}
      <div className="[perspective:1200px]">
        {/* inner rotates */}
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5 }}
          className="relative h-[320px] w-full [transform-style:preserve-3d]"
        >
          {/* FRONT */}
          <div className="absolute inset-0 rounded-2xl border bg-background shadow-sm [backface-visibility:hidden] overflow-hidden">
            {/* image header */}
            <div className="relative h-36 w-full bg-muted">
              {npc.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={npc.image_url}
                  alt={npc.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                  No Image
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                <div className="text-lg font-semibold text-white">{npc.name}</div>
              </div>
            </div>

            {/* quick stats */}
            <div className="p-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Stat label="AC" value={npc.ac ?? "—"} />
                <Stat label="HP" value={npc.hp ?? "—"} />
                <Stat label="Speed" value={npc.speed ?? "—"} />
              </div>

              <div className="mt-3 grid grid-cols-6 gap-2 text-center text-xs">
                <AbilityBox k="STR" score={ab.str} />
                <AbilityBox k="DEX" score={ab.dex} />
                <AbilityBox k="CON" score={ab.con} />
                <AbilityBox k="INT" score={ab.int} />
                <AbilityBox k="WIS" score={ab.wis} />
                <AbilityBox k="CHA" score={ab.cha} />
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Click to flip</span>
                <span className="opacity-0 transition group-hover:opacity-100">Traits & Actions →</span>
              </div>
            </div>
          </div>

          {/* BACK */}
          <div className="absolute inset-0 rounded-2xl border bg-background shadow-sm [transform:rotateY(180deg)] [backface-visibility:hidden] overflow-hidden">
            <div className="flex items-center justify-between border-b p-3">
              <div className="font-semibold">{npc.name}</div>
              <div className="text-xs text-muted-foreground">Click to flip back</div>
            </div>

            <div className="h-[calc(320px-49px)] overflow-auto p-3">
              {/* Traits */}
              {npc.traits?.length ? (
                <section className="mb-4">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Traits</h4>
                  <ul className="mt-2 space-y-2">
                    {npc.traits.map((t) => (
                      <li key={t.id} className="text-sm">
                        <span className="font-medium">{t.name}.</span>{" "}
                        <span className="text-muted-foreground italic">{t.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Actions */}
              {npc.actions?.length ? (
                <section>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">Actions</h4>
                  <ul className="mt-2 space-y-3">
                    {npc.actions.map((a) => {
                      const usesAttack = a.usesAttackRoll !== false && (a.type === "melee" || a.type === "ranged" || a.type === "other");
                      const atk = a.attackBonusOverride ?? atkFallback;

                      return (
                        <li key={a.id} className="rounded-xl border p-2">
                          <div className="text-sm font-medium">{a.name}</div>

                          {usesAttack && a.damage?.dice ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium">+{atk}</span> to hit •{" "}
                              <span className="font-medium">{a.damage.dice}</span>
                              {a.damage.bonus ? ` + ${a.damage.bonus}` : ""}{" "}
                              {a.damage.type ?? ""}
                            </div>
                          ) : null}

                          {a.save ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              DC <span className="font-medium">{a.save.dcOverride ?? dcFallback}</span>{" "}
                              <span className="font-medium">{a.save.ability.toUpperCase()}</span> save
                              {(a.save.onFail || a.save.onSuccess) ? (
                                <div className="mt-1 space-y-1">
                                  {a.save.onFail ? <div><span className="font-medium">Fail:</span> {a.save.onFail}</div> : null}
                                  {a.save.onSuccess ? <div><span className="font-medium">Success:</span> {a.save.onSuccess}</div> : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : (
                <div className="text-sm text-muted-foreground">No actions yet.</div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border p-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{String(value)}</div>
    </div>
  );
}

function AbilityBox({ k, score }: { k: string; score?: number }) {
  return (
    <div className="rounded-xl border p-2">
      <div className="text-[10px] font-semibold text-muted-foreground">{k}</div>
      <div className="text-sm font-semibold leading-4">{score ?? "—"}</div>
      <div className="text-[11px] text-muted-foreground">{score != null ? fmtMod(score) : ""}</div>
    </div>
  );
}
