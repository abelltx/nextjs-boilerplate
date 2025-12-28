import Link from "next/link";
import { listNpcs } from "@/lib/designer/npcs";

export default async function NpcsListPage() {
  const npcs = await listNpcs();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">NPCs</h1>
          <p className="text-sm text-muted-foreground">Manage NPCs for encounters and scenes.</p>
        </div>
        <Link
          href="/admin/designer/npcs/new"
          className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90"
        >
          New NPC
        </Link>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Thumb</th>
              <th className="p-3">Name</th>
              <th className="p-3">Type</th>
              <th className="p-3">Role</th>
              <th className="p-3">Updated</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {npcs.map((n) => (
              <tr key={n.id} className="border-t">
                <td className="p-3">
                  {/* Thumbnail (56x72) */}
                  {n.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.thumbUrl}
                      alt={n.image_alt ?? n.name}
                      width={56}
                      height={72}
                      className="rounded-md border object-cover"
                    />
                  ) : (
                    <div className="w-[56px] h-[72px] rounded-md border bg-muted/40" />
                  )}
                </td>
                <td className="p-3 font-medium">{n.name}</td>
                <td className="p-3">{n.npc_type}</td>
                <td className="p-3">{n.default_role}</td>
                <td className="p-3">{new Date(n.updated_at).toLocaleString()}</td>
                <td className="p-3 text-right">
                  <Link className="underline" href={`/admin/designer/npcs/${n.id}`}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {npcs.length === 0 && (
              <tr>
                <td className="p-6 text-muted-foreground" colSpan={6}>
                  No NPCs yet. Click â€œNew NPCâ€.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
