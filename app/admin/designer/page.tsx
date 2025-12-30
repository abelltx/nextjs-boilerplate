import Link from "next/link";
import { listNpcs } from "@/lib/designer/npcs";
import NpcFlipCard from "@/components/designer/npcs/NpcFlipCard";



export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NpcsPage() {
  const npcs = await listNpcs();

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">NPCs</h1>
          <p className="text-sm text-muted-foreground">
            Your NPC library. Click a card to edit stats, image, and notes.
          </p>
        </div>

        <Link
          href="/admin/designer/npcs/new"
          className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90"
        >
          New NPC
        </Link>
      </div>

      {npcs.length === 0 ? (
        <div className="border rounded-xl p-6 text-sm text-muted-foreground">
          No NPCs yet. Create your first one.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {npcs.map((npc: any) => (
        <NpcFlipCard key={npc.id} npc={npc} />
        ))}

        </div>
      )}
    </div>
  );
}
