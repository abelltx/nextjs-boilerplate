import Link from "next/link";
import { notFound } from "next/navigation";
import { getNpcById } from "@/lib/designer/npcs";
import { updateNpcAction, archiveNpcAction } from "@/app/actions/npcs";
import NpcImageUploader from "@/components/designer/npcs/NpcImageUploader";
import StatBlockEditor from "@/components/designer/npcs/StatBlockEditor";

export default async function EditNpcByQueryPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const raw = searchParams?.id;
  const id = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">EDIT ROUTE IS LIVE ✅</h1>
      <p className="mt-2 text-sm opacity-80">
        If you can see this, the /admin/designer/npcs/edit route exists and Vercel is serving this code.
      </p>
      <pre className="mt-4 text-sm">id = {id || "(missing)"}</pre>
      <Link className="underline" href="/admin/designer/npcs">
        Back to NPCs
      </Link>
    </div>
  );
}
