import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function getQueryParamFromUrl(
  fullUrl: string | null,
  param: string
): string | null {
  if (!fullUrl) return null;

  try {
    const url = fullUrl.startsWith("http")
      ? new URL(fullUrl)
      : new URL(fullUrl, "https://play.neweyes.org");

    return url.searchParams.get(param);
  } catch {
    return null;
  }
}

export default async function EditTraitPage() {
  // ✅ CALL ONCE
  const h = await headers();

  const rawUrl =
    h.get("x-url") ||
    h.get("x-forwarded-uri") ||
    h.get("referer");

  const id = getQueryParamFromUrl(rawUrl, "id");

  if (!isUuid(id)) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Trait not found</h1>
        <p className="mt-2 text-slate-700">Missing or invalid trait id.</p>

        <pre className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
{JSON.stringify(
  {
    debug: {
      id,
      rawUrl,
    },
  },
  null,
  2
)}
        </pre>

        <Link
          href="/admin/traits"
          className="mt-4 inline-block text-sm font-semibold text-slate-700 underline"
        >
          ← Back to Traits
        </Link>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: trait, error } = await supabase
    .from("traits")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !trait) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Trait not found</h1>
        <p className="mt-2 text-slate-700">
          This trait does not exist or you don’t have access.
        </p>
        <pre className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
{JSON.stringify({ id, error: error?.message ?? null }, null, 2)}
        </pre>
        <Link
          href="/admin/traits"
          className="mt-4 inline-block text-sm font-semibold text-slate-700 underline"
        >
          ← Back to Traits
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Edit Trait</h1>
      <p className="mb-4 text-sm text-slate-600">Trait ID: {id}</p>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Name
            </label>
            <input
              defaultValue={trait.name ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Type
            </label>
            <input
              defaultValue={trait.type ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Summary
            </label>
            <textarea
              defaultValue={trait.summary ?? ""}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
