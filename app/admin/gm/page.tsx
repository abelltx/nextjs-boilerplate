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
      safeCount(supabase, "items"), // ✅ Items dashboard count
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
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {status === "live" ? "Live" : "Coming Soon"}
    </span>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center rounded-full border bg-white/70 px-2 py-0.5 text-xs font-medium">
      {n}
    </span>
  );
}

function CardTile({ c }: { c: Card }) {
  const inner = (
    <div
      className={`rounded-2xl border p-4 transition ${toneClasses(
        c.tone
      )} flex flex-col gap-2`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-base font-semibold">{c.title}</div>
        <div className="flex items-center gap-2">
          <CountBadge n={c.count} />
          {c.status ? <StatusPill status={c.status} /> : null}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">{c.description}</div>

      <div className="mt-1 text-xs text-muted-foreground">
        {c.href ? c.href : "Not wired yet"}{" "}
        {c.href ? (
          <span className="ml-2 inline-flex items-center rounded-lg border bg-white/70 px-2 py-1 text-xs">
            Open →
          </span>
        ) : (
          <span className="ml-2 inline-flex items-center rounded-lg border bg-white/70 px-2 py-1 text-xs">
            Soon
          </span>
        )}
      </div>
    </div>
  );

  return c.href ? <Link href={c.href}>{inner}</Link> : inner;
}

export default async function GMHubPage() {
  const counts = await getCounts();

  const cards: Card[] = [
    {
      title: "Episodes Designer",
      description: "Build storyboards, scenes, encounters, and episode assets.",
      href: "/admin/episodes",
      count: counts.episodes,
      status: "live",
      tone: "orange",
    },
    {
      title: "NPC Designer",
      description: "Create NPCs, stats, trait sets, and action kits.",
      href: "/admin/designer",
      count: counts.npcs,
      status: "live",
      tone: "blue",
    },
    {
      title: "Traits Designer",
      description: "Manage the global trait library used by NPCs and players.",
      href: "/admin/traits",
      count: counts.traits,
      status: "live",
      tone: "purple",
    },
    {
      title: "Actions Designer",
      description: "Manage the global action library (melee/ranged/other).",
      href: "/admin/actions",
      count: counts.actions,
      status: "live",
      tone: "green",
    },
    {
      title: "Items Designer",
      description: "Manage items, images, and item effects for loot & equipment.",
      href: "/admin/items",
      count: counts.items,
      status: "live",
      tone: "amber",
    },
    {
      title: "Inventory Designer",
      description: "Items, loot tables, equipment cards, and rewards.",
      href: undefined,
      count: counts.inventory,
      status: "coming",
      tone: "amber",
    },
    {
      title: "User Manager",
      description: "Manage Storytellers, players, roles, and access.",
      href: undefined,
      count: counts.users,
      status: "coming",
      tone: "red",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">GameMaster Hub</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your command center for building and running Neweyes content.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <CardTile key={c.title} c={c} />
        ))}
      </div>

      <div className="mt-8 text-xs text-muted-foreground">
        Counts are fetched using <span className="font-mono">head: true</span>{" "}
        for speed. Missing tables show as 0 instead of crashing.
      </div>
    </div>
  );
}
