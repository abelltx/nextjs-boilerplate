import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { updateTraitAction, deleteTraitAction } from "@/app/actions/traitsAdmin";

function looksLikeUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  );
}

export default async function TraitEditPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const id = params?.id ?? "";

  const BUILD_FINGERPRINT = "traits-detail-2025-12-30-a";

return (
  <div className="p-6">
    <h1 className="text-xl font-bold">TRAITS DETAIL FINGERPRINT</h1>
    <pre className="mt-3 rounded-xl border p-3">
      {JSON.stringify({ BUILD_FINGERPRINT, params }, null, 2)}
    </pre>
  </div>
);
}