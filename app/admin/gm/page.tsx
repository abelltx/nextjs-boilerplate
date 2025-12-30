// app/admin/gm/page.tsx
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

type Counts = {
  episodes: number;
  npcs: number;
  traits: number;
  actions: number;
  inventory: number;
  users: number;
};

async function safeCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string
) {
  // HEAD + count avoids pulling rows
  const { count, error } = await supabase
    .from(table as any)
    .select("*", { count: "exact", head: true });

  // If the table doesn't exist yet (or RLS blocks), just show 0 rather than crash
  if (error) return 0;
  return count ?? 0;
}

async function getCounts(): Promise<Counts> {
  const supabase = await createClient();

  // If some tables don't exist yet, safeCount() returns 0.
  const [episodes, npcs, traits, actions, inventory, users] = await Promise.all([
    safeCount(supabase, "episodes"),
    safeCount(supabase, "npcs"),
    safeCount(supabase, "npc_traits"), // adjust if your table name differs
    safeCount(supabase, "npc_actions"), // adjust if your table name differs
    safeCount(supabase, "inventory_items"), // future
    safeCount(supabase, "profiles"), // usually your user table
  ]);

  return { episodes, npcs, traits, actions, inventory, users };
}

type Card = {
  title: string;
  description: string;
  href?: string;
  count: number;
  status?: "live" | "coming";
  tone:
    | "orange"
    | "blue"
    | "green"
    | "purple"
    | "red"
    | "slate"
    | "amber";
};

function toneClasses(tone: Card["tone"]) {
  // Tailwind-only, no custom CSS needed
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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status === "live" ? "Live" : "Coming Soon"}
    </span>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-900 shadow-sm">
      {n}
    </span>
  );
}

function CardTile({ c }: { c: Card }) {
  const content = (
    <div
      className={`group relative flex h-full flex-col gap-3 rounded-2xl border p-5 shadow-sm transition ${toneClasses(
        c.tone
      )} ${c.href ? "cursor-pointer" : "cursor-default opacity-90"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-slate-900">
              {c.title}
            </h2>
            <CountBadge n={c.count} />
          </div>
          <p className="mt-1 text-sm text-slate-700">{c.description}</p>
        </div>

        <StatusPill status={c.status ?? (c.href ? "live" : "coming")} />
      </div>

      <div className="mt-auto flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {c.href ? c.href : "Not wired yet"}
        </span>
        {c.href ? (
          <span className="text-sm font-semibold text-slate-900 transition group-hover:translate-x-0.5">
            Open →
          </span>
        ) : (
          <span className="text-sm font-semibold text-slate-500">Soon</span>
        )}
      </div>
    </div>
  );

  return c.href ? (
    <Link href={c.href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
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
      href: undefined, // set when built, e.g. "/admin/traits"
      count: counts.traits,
      status: "coming",
      tone: "purple",
    },
    {
      title: "Actions Designer",
      description: "Manage the global action library (melee/ranged/other).",
      href: undefined, // set when built, e.g. "/admin/actions"
      count: counts.actions,
      status: "coming",
      tone: "green",
    },
    {
      title: "Inventory Designer",
      description: "Items, loot tables, equipment cards, and rewards.",
      href: undefined, // set when built, e.g. "/admin/inventory"
      count: counts.inventory,
      status: "coming",
      tone: "amber",
    },
    {
      title: "User Manager",
      description: "Manage Storytellers, players, roles, and access.",
      href: undefined, // set when built, e.g. "/admin/users"
      count: counts.users,
      status: "coming",
      tone: "red",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-900">GameMaster Hub</h1>
        <p className="text-slate-700">
          Your command center for building and running Neweyes content.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <CardTile key={c.title} c={c} />
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          Quick setup notes
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            This page is at <span className="font-mono">/admin/gm</span>.
          </li>
          <li>
            Counts use Supabase <span className="font-mono">head: true</span> so
            it’s fast.
          </li>
          <li>
            If a table doesn’t exist yet (Traits/Actions/Inventory), it shows{" "}
            <b>0</b> instead of crashing.
          </li>
        </ul>
      </div>
    </div>
  );
}
