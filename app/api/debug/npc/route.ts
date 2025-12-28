import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";

  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  const supabase = await createClient();
  const res = await supabase
    .from("npcs")
    .select("id,name")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({
    ok: !res.error,
    error: res.error?.message ?? null,
    found: !!res.data,
    data: res.data ?? null,
  });
}
