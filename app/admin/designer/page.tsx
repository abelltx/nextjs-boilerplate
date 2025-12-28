import Link from "next/link";

export default function DesignerHomePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Game Designer</h1>
        <p className="text-sm text-muted-foreground">
          Manage NPCs, Special Traits, and Actions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/designer/npcs" className="border rounded-xl p-4 hover:bg-muted/40">
          <div className="font-semibold">NPCs</div>
          <div className="text-sm text-muted-foreground">Create and manage NPC cards</div>
        </Link>

        <div className="border rounded-xl p-4 opacity-60">
          <div className="font-semibold">Special Traits</div>
          <div className="text-sm text-muted-foreground">Coming next</div>
        </div>

        <div className="border rounded-xl p-4 opacity-60">
          <div className="font-semibold">Actions</div>
          <div className="text-sm text-muted-foreground">Coming next</div>
        </div>
      </div>
    </div>
  );
}
