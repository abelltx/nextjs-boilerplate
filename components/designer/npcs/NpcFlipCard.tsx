"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function n(v: any, fallback = 0) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function signed(num: number) {
  return num >= 0 ? `+${num}` : String(num);
}
function abilitiesRow(abilities: any) {
  const a = abilities ?? {};
  return [
    ["STR", n(a.str, 10)],
    ["DEX", n(a.dex, 10)],
    ["CON", n(a.con, 10)],
    ["INT", n(a.int, 10)],
    ["WIS", n(a.wis, 10)],
    ["CHA", n(a.cha, 10)],
  ] as const;
}

export default function NpcFlipCard({ npc }: { npc: any }) {
  const [flipped, setFlipped] = useState(false);

  const sb = npc.stat_block ?? {};
  const img = (npc.thumbUrl as string | null) ?? null;

  const abilities = useMemo(() => abilitiesRow(sb.abilities), [sb?.abilities]);

  const hp = n(sb.hp, 10);
  const ac = n(sb.ac, 10);
  const speed = n(sb.speed, 30);

  const mab = n(sb.melee_attack_bonus, 0);
  const rab = n(sb.ranged_attack_bonus, 0);
  const dc = n(sb.save_dc, 10);

  // ✅ these must be added by listNpcs() (same as edit page)
  const passives: any[] = Array.isArray(npc.passives) ? npc.passives : [];
  const effectiveActions: any[] = Array.isArray(npc.effectiveActions) ? npc.effectiveActions : [];

  return (
    <div className="group relative w-full">
      <div className="[perspective:1200px]">
        <div
          className={[
            "relative h-[340px] w-full [transform-style:preserve-3d] transition-transform duration-500",
            flipped ? "[transform:rotateY(180deg)]" : "",
          ].join(" ")}
        >
          {/* ================= FRONT ================= */}
          <button
            type="button"
            onClick={() => setFlipped((s) => !s)}
            className="absolute inset-0 w-full text-left rounded-2xl border bg-background shadow-sm [backface-visibility:hidden] overflow-hidden"
          >
            <div className="p-4">
              <div className="flex gap-3">
                <div className="w-20 h-20 rounded-xl border bg-muted/30 overflow-hidden flex items-center justify-center shrink-0">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={npc.image_alt ?? npc.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs opacity-60">No Image</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{npc.name}</h3>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-full border">
                          {npc.npc_type ?? "npc"}
                        </span>
                        <span className="px-2 py-0.5 rounded-full border">
                          {npc.default_role ?? "neutral"}
                        </span>
                      </div>
                    </div>

                    <Link
                      href={`/admin/designer/npcs/edit?id=${npc.id}`}
                      className="shrink-0 px-3 py-2 rounded-lg border hover:bg-muted/40 text-sm"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      Edit
                    </Link>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="border rounded-lg p-2">
                      <div className="opacity-70">HP</div>
                      <div className="font-semibold">{hp}</div>
                    </div>
                    <div className="border rounded-lg p-2">
                      <div className="opacity-70">AC</div>
                      <div className="font-semibold">{ac}</div>
                    </div>
                    <div className="border rounded-lg p-2">
                      <div className="opacity-70">Speed</div>
                      <div className="font-semibold">
                        {speed} <span className="opacity-60">({Math.floor(speed / 5)} sq)</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-xs border rounded-lg p-2 flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      <span className="opacity-70">Melee</span>{" "}
                      <span className="font-semibold">{signed(mab)}</span>
                    </span>
                    <span>
                      <span className="opacity-70">Ranged</span>{" "}
                      <span className="font-semibold">{signed(rab)}</span>
                    </span>
                    <span>
                      <span className="opacity-70">DC</span>{" "}
                      <span className="font-semibold">{dc}</span>
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-6 gap-1 text-[11px]">
                    {abilities.map(([k, v]) => (
                      <div key={k} className="border rounded-md p-1 text-center">
                        <div className="opacity-70">{k}</div>
                        <div className="font-semibold">{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Click to flip</span>
                    <span className="opacity-0 transition group-hover:opacity-100">
                      Traits & Actions →
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </button>

          {/* ================= BACK ================= */}
          <button
            type="button"
            onClick={() => setFlipped((s) => !s)}
            className="absolute inset-0 w-full text-left rounded-2xl border bg-background shadow-sm [transform:rotateY(180deg)] [backface-visibility:hidden] overflow-hidden"
          >
            <div className="flex items-center justify-between border-b p-3">
              <div className="font-semibold truncate pr-2">{npc.name}</div>
              <div className="text-xs text-muted-foreground">Click to flip back</div>
            </div>

            <div className="h-[calc(340px-49px)] overflow-auto p-3 space-y-4">
              <section className="border rounded-lg p-3">
                <div className="font-medium mb-2">Effective Passives</div>
                {passives.length ? (
                  <div className="space-y-2">
                    {passives.map((p: any) => (
                      <div key={p.trait_id ?? p.trait_name} className="border rounded-lg p-2">
                        <div className="font-medium text-sm">{p.trait_name ?? "Trait"}</div>
                        {Array.isArray(p.passives) && p.passives.length ? (
                          <ul className="mt-1 text-xs text-muted-foreground list-disc pl-5 space-y-1">
                            {p.passives.map((item: any, idx: number) => (
                              <li key={idx}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mt-1 text-xs text-muted-foreground">None</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">None</div>
                )}
              </section>

              <section className="border rounded-lg p-3">
                <div className="font-medium mb-2">Effective Actions</div>
                {effectiveActions.length ? (
                  <div className="space-y-2">
                    {effectiveActions.map((a: any) => (
                      <div key={a.action_id ?? a.name} className="border rounded-lg p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-sm">{a.name ?? "Action"}</div>
                          <div className="text-xs text-muted-foreground">
                            {String(a.activation ?? "").replaceAll("_", " ")}
                          </div>
                        </div>
                        {a.description ? (
                          <div className="text-xs text-muted-foreground mt-1">{a.description}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">None</div>
                )}
              </section>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
