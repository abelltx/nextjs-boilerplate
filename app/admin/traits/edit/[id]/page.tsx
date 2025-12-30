import Link from "next/link";

export default async function TraitEditPage({
  params,
}: {
  params: { id: string };
}) {
  const BUILD_FINGERPRINT = "traits-edit-detail-2025-12-30-a";

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">TRAITS EDIT FINGERPRINT</h1>
      <pre className="mt-3 rounded-xl border p-3">
        {JSON.stringify({ BUILD_FINGERPRINT, params }, null, 2)}
      </pre>

      <Link
        href="/admin/traits"
        className="mt-4 inline-block rounded-xl border px-3 py-2 text-sm font-semibold"
      >
        ← Back
      </Link>
    </div>
  );
}
