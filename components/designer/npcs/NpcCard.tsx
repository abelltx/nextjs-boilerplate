import Link from "next/link";

function n(v: any, fallback = 0) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function signed(n: number) {
  return n >= 0 ? `+${n}` : String(n);
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

export default function NpcCard({ npc }: { npc: any }) {
  const sb = npc.stat_block ?? {};
  const abilities = abilitiesRow(sb.abilities);

  const hp = n(sb.hp, 10);
  const ac = n(sb.ac, 10);
  const speed = n(sb.speed, 30);

  const mab = n(sb.melee_attack_bonus, 0);
  const rab = n(sb.ranged_attack_bonus, 0);
  const dc = n(sb.save_dc, 10);

  const img = npc.thumbUrl as string | null;

  return (
    <div className="border rounded-2xl p-4 shadow-sm bg-background">
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
        </div>
      </div>
    </div>
  );
}
