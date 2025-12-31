import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

type Counts = {
  episodes: number;
  npcs: number;
  traits: number;
  actions: number;
  items: number;
  inventory: number;
  users: number;
};

async function safeCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string
) {
  const { count, error } = await supabase
    .from(table as any)
    .select("*", { count: "exact", head: true });

  if (error) return 0;
  return count ?? 0;
}

async function getCounts(): Promise<Counts> {
  const supabase = await createClient();

  const [episodes, npcs, traits, actions, items, inventory, users] =
    await Promise.all([
      safeCount(supabase, "episodes"),
      safeCount(supabase, "npcs"),
      safeCount(supabase, "traits"),
      safeCount(supabase, "actions"),
      safeCount(supabase, "items"), // ✅ new
      safeCount(supabase, "inventory_items"),
      safeCount(supabase, "profiles"),
    ]);

  return { episodes, npcs, traits, actions, items, inventory, users };
}

type Card = {
  title: string;
  description: string;
  href?: string;
  count: number;
  status?: "live" | "coming";
  tone: "orange" | "blue" | "green" | "purple" | "red" | "slate" | "amber";
};

function toneClasses(tone: Card["tone"]) {
  switch (tone) {
    case "orange":
      return "border-orange-200 bg-orange-50/60 hover:bg-orange-50";
    case "blue":
      return "border-blue-200 bg-blue-50/60 hover:bg-blue-50";
    case "green":
      return "border-green-200 bg-green-50/60 hover:bg-green-50";
    case "purple":
      return "border-purple-200 bg-purple-50/60 hover:bg-purple-50";
    case "red":
      return "border-red-200 bg-red-50/60 hover:bg-red-50";
    case "amber":
      return "border-amber-200 bg-amber-50/60 hover:bg-amber-50";
    default:
      return "border-slate-200 bg-slate-50/60 hover:bg-slate-50";
  }
}

function StatusPill({ status }: { status: "live" | "coming" }) {
  const cls =
    status === "live"
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
      {status === "live" ? "Live" : "Coming"}
    </span>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center rounded-full border bg-white/70 px-2 py-0.5 text-[11px] font-medium">
      {n}
    </span>
  );
}

function CardTile({ c }: { c: Card }) {
  const body = (
    <div className={`rounded-xl border p-3 transition ${toneClasses(c.tone)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{c.title}</div>
          <div className="mt-1 text-xs text-muted-foreground leading-snug">
            {c.description}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <CountBadge n={c.count} />
          {c.status ? <StatusPill status={c.status} /> : null}
        </div>
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
        {c.href ? (
          <span className="inline-flex items-center gap-2">
            <span className="font-mono">{c.href}</span>
            <span className="rounded-md border bg-white/70 px-2 py-0.5">Open →</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="font-mono">—</span>
            <span className="rounded-md border bg-white/70 px-2 py-0.5">Soon</span>
          </span>
        )}
      </div>
    </div>
  );

  return c.href ? <Link href={c.href}>{body}</Link> : body;
}

export default async function GMHubPage() {
  const counts = await getCounts();

  const cards: Card[] = [
    {
      title: "Episodes",
      description: "Storyboards, scenes, encounters.",
      href: "/admin/episodes",
      count: counts.episodes,
      status: "live",
      tone: "orange",
    },
    {
      title: "NPCs",
      description: "NPC stats, traits, actions.",
      href: "/admin/designer",
      count: counts.npcs,
      status: "live",
      tone: "blue",
    },
    {
      title: "Traits",
      description: "Global trait library.",
      href: "/admin/traits",
      count: counts.traits,
      status: "live",
      tone: "purple",
    },
    {
      title: "Actions",
      description: "Global action library.",
      href: "/admin/actions",
      count: counts.actions,
      status: "live",
      tone: "green",
    },
    {
      title: "Items",
      description: "weapons + quest items + gear.",
      href: "/admin/items",
      count: counts.items,
      status: "live",
      tone: "amber",
    },
    {
      title: "Inventory",
      description: "Loot tables, rewards (later).",
      href: undefined,
      count: counts.inventory,
      status: "coming",
      tone: "slate",
    },
    {
      title: "Users",
      description: "Roles + access (later).",
      href: undefined,
      count: counts.users,
      status: "coming",
      tone: "slate",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">GameMaster Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quick links to your builders.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <CardTile key={c.title} c={c} />
        ))}
      </div>
    </div>
  );
}
